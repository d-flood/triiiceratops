// @vitest-environment node
/**
 * Consumer-bundle regression, over the BUILT ESM entry.
 *
 * `dist/index.js` is the artifact a host's bundler consumes, and minifying it
 * can make a consumer's application BIGGER while making this package's own file
 * smaller. Vite's library build knows that and deliberately leaves ES output
 * whitespace-unminified, because collapsing whitespace strips the `@__PURE__`
 * annotations rollup, esbuild and webpack all tree-shake with. The shared
 * plugin build (core's `src/packaging/pluginBuild.ts`) recovers those bytes
 * with a terser pass that keeps the annotations (`preserve_annotations`) — and
 * this file is what proves the annotations are still there and still doing their
 * job, since nothing else in this repository observes what happens to this
 * package inside somebody else's build.
 *
 * No byte ceiling: this package's artifacts are deliberately ungated (only
 * core's element artifacts and the core-plus-AV pair are measured), so what is
 * asserted is the tree-shaking CONTRACT — annotations survive, the declared
 * peers stay bare specifiers a host dedupes against its own copies, and the
 * bundled Svelte runtime this plugin owns is not one of them.
 *
 * Requires `pnpm --filter @triiiceratops/plugin-annotation-editor build` to have run. It runs in the `node`
 * environment rather than this package's default: it drives a real Vite build,
 * and esbuild refuses to start under jsdom's `TextEncoder`.
 *
 * To verify this guard once: set `format.preserve_annotations` to `false` in
 * `pluginBuild`'s terser options, rebuild, and watch the annotation assertion
 * fail.
 */

import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Rollup } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

const ENTRY = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../dist/index.js',
);

/** The peers the ESM build declares; a consumer's bundler resolves them. */
const PEERS = ['@triiiceratops/plugin-sdk', 'triiiceratops', 'vitest'];

/**
 * Bundle a consumer that imports one export and re-exports it.
 *
 * Re-exported rather than merely referenced so the export cannot be shaken away
 * as unused, which would leave every assertion below passing over an empty
 * bundle. The peers stay external exactly as a host application's build leaves
 * them, so what remains is this package's own retained graph and nothing else.
 */
async function bundleConsumer(): Promise<string> {
    const dir = mkdtempSync(join(tmpdir(), 'tri-consumer-'));
    const entry = join(dir, 'consumer.js');
    writeFileSync(
        entry,
        `export { AnnotationEditorPlugin } from ${JSON.stringify(ENTRY)};\n`,
    );

    const result = (await build({
        logLevel: 'error',
        configFile: false,
        build: {
            write: false,
            minify: false,
            lib: { entry, formats: ['es'], fileName: () => 'consumer.js' },
            rollupOptions: {
                external: PEERS.map((peer) => new RegExp(`^${peer}(/|$)`)),
            },
        },
    })) as Rollup.RollupOutput[];

    const chunk = result[0]?.output.find(
        (output) => output.type === 'chunk' && output.isEntry,
    );
    if (chunk?.type !== 'chunk') {
        throw new Error('bundling the consumer emitted no entry chunk');
    }
    return chunk.code;
}

describe('the built ESM entry survives a consumer bundle', () => {
    it('has a build to inspect', () => {
        expect(
            existsSync(ENTRY),
            `${ENTRY} is missing — run \`pnpm --filter @triiiceratops/plugin-annotation-editor build\``,
        ).toBe(true);
    });

    it('keeps the purity annotations a consumer tree-shakes with', () => {
        const entry = existsSync(ENTRY) ? readFileSync(ENTRY, 'utf8') : '';
        expect(
            entry.includes('__PURE__'),
            'no @__PURE__ annotation survived in dist/index.js — the terser ' +
                'pass has stopped preserving them and consumer bundles will ' +
                'retain code they used to drop',
        ).toBe(true);
    });

    describe('bundled into a host application', () => {
        let consumer = '';

        beforeAll(async () => {
            consumer = await bundleConsumer();
        }, 120_000);

        it('re-exports AnnotationEditorPlugin', () => {
            expect(consumer).toMatch(/\bAnnotationEditorPlugin\b/);
        });

        it('imports nothing but the declared peers', () => {
            // What a consumer's bundle may still reference by bare specifier is
            // exactly the declared peers: anything else here is a dependency
            // this package bundled into the host's application by accident.
            // `svelte` is deliberately absent from the set — these plugins
            // bundle their own runtime rather than sharing core's, which is the
            // asymmetry with the AV plugin.
            const specifiers = new Set<string>();
            for (const match of consumer.matchAll(/from\s*["']([^"']+)["']/g)) {
                if (match[1]) specifiers.add(match[1]);
            }
            const foreign = [...specifiers].filter(
                (specifier) =>
                    !PEERS.some(
                        (peer) =>
                            specifier === peer ||
                            specifier.startsWith(`${peer}/`),
                    ),
            );
            expect(foreign, foreign.join(', ')).toEqual([]);
            // And the SDK really is reached by specifier rather than inlined:
            // an empty set would satisfy the check above.
            expect([...specifiers]).toContain('@triiiceratops/plugin-sdk');
        });
    });
});
