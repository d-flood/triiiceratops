// @vitest-environment node
/**
 * Consumer-bundle regression, over the BUILT ESM entry.
 *
 * `dist/index.js` is the artifact a host's bundler consumes, and minifying it
 * can make a consumer's application BIGGER while making this package's own file
 * smaller. Vite's library build knows that and deliberately leaves ES output
 * whitespace-unminified, because collapsing whitespace strips the `@__PURE__`
 * annotations rollup, esbuild and webpack all tree-shake with. `vite.config.ts`
 * recovers those bytes with a terser pass that keeps the annotations
 * (`preserve_annotations`) — and this file is what proves the annotations are
 * still there and still doing their job, since nothing else in this repository
 * observes what happens to this package inside somebody else's build.
 *
 * The three exports are bundled SEPARATELY because that is how a host imports
 * them. What they retain is deliberately expressed as a byte CEILING rather
 * than as "this export's graph and no other's": the published entry is a single
 * rollup chunk, so importing any one export keeps the eager graph, and that was
 * as true before this pass as after it. Measured both ways, the retained marker
 * set is identical and every consumer is about 5.8 KB smaller — so the invariant
 * worth holding is that a consumer never retains MORE, which is what the
 * ceilings say.
 *
 * Requires `pnpm --filter @triiiceratops/plugin-av build` to have run. It runs
 * in the `node` environment rather than this package's jsdom default: it drives
 * a real Vite build, and esbuild refuses to start under jsdom's `TextEncoder`.
 *
 * To verify this guard once: set `format.comments` to `false` in
 * `vite.config.ts`'s `terserOptions`, rebuild, and watch the annotation
 * assertion fail.
 */

import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Rollup } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const ENTRY = join(DIST, 'index.js');

/**
 * The chunks the ESM entry imports, by the specifiers it writes.
 *
 * Derived from the entry rather than read off the directory, for the reason
 * `lazy-chunks.guard.test.ts` gives: a leftover file from an earlier build must
 * not be able to satisfy an assertion about what ships.
 */
function esmChunks(entry: string): string[] {
    return [
        ...new Set(
            [
                ...entry.matchAll(/import\(\s*["']\.\/([^"']+\.js)["']\s*\)/g),
            ].map(([, name]) => name),
        ),
    ];
}

/**
 * Code only one of the three exports' graphs can have put in a bundle, and the
 * ceiling on the bytes a consumer of that export retains.
 *
 * The markers are strings, so they survive a host's own minifier: the plugin's
 * catalog carries the panel's message keys, the scanner carries the HLS media
 * type it classifies by, and the state accessor carries the member name its
 * structural check reads.
 *
 * The ceilings are the measured actual plus {@link SLACK}, on unminified
 * output, in the same ratchet idiom as `scripts/size-check.mjs`. They are the
 * only thing in this repository that would notice this package getting smaller
 * at a host application's expense.
 */
const CONSUMERS = {
    AvPlugin: { marker: 'av_notes_panel', ceiling: 46_401 },
    scanCanvasForAv: { marker: 'vnd.apple.mpegurl', ceiling: 46_401 },
    getAVState: { marker: 'activeMediaCanvasId', ceiling: 46_542 },
} as const;

/** Byte slack over each recorded ceiling, matching `scripts/size-check.mjs`. */
const SLACK = 512;

type ExportName = keyof typeof CONSUMERS;

const EXPORTS = Object.keys(CONSUMERS) as ExportName[];

/** The peers the ESM build declares; a consumer's bundler resolves them. */
const PEERS = ['svelte', '@triiiceratops/plugin-sdk', 'triiiceratops'];

/**
 * Bundle one consumer that imports exactly one export and re-exports it.
 *
 * Re-exported rather than merely referenced so the export cannot be shaken away
 * as unused, which would make every "is the rest gone?" assertion below pass
 * over an empty bundle. The peers stay external exactly as a host application's
 * build leaves them — a host has core and Svelte of its own — so what remains
 * is this package's own retained graph and nothing else.
 *
 * Only the ENTRY chunk is returned. The plugin's lazy halves stay lazy through
 * a consumer's build too — the host's bundler re-splits them into its own
 * chunks — so counting their bytes as retained would report the waveform
 * parsers as eager cost for an application that never opens a waveform.
 */
async function bundleConsumer(name: ExportName): Promise<string> {
    const dir = mkdtempSync(join(tmpdir(), 'tri-av-consumer-'));
    const entry = join(dir, 'consumer.js');
    writeFileSync(entry, `export { ${name} } from ${JSON.stringify(ENTRY)};\n`);

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

    const entryChunk = result[0].output.find(
        (chunk) => chunk.type === 'chunk' && chunk.isEntry,
    );
    if (entryChunk?.type !== 'chunk') {
        throw new Error(`bundling the ${name} consumer emitted no entry chunk`);
    }
    return entryChunk.code;
}

describe('the built ESM entry survives a consumer bundle', () => {
    it('has a build to inspect', () => {
        expect(
            existsSync(ENTRY),
            `${ENTRY} is missing — run \`pnpm --filter @triiiceratops/plugin-av build\``,
        ).toBe(true);
    });

    const entry = existsSync(ENTRY) ? readFileSync(ENTRY, 'utf8') : '';

    it('keeps the purity annotations a consumer tree-shakes with', () => {
        // The entry and every chunk it reaches: the lazy HLS chunk carries the
        // most of them, and it is the one whose unused halves a consumer's
        // bundler has the most to gain from dropping.
        const artifacts = [
            { name: 'index.js', code: entry },
            ...esmChunks(entry).map((name) => ({
                name,
                code: readFileSync(join(DIST, name), 'utf8'),
            })),
        ];
        const annotated = artifacts.filter(({ code }) =>
            code.includes('__PURE__'),
        );
        expect(
            annotated.map(({ name }) => name),
            `no @__PURE__ annotation survived in any of ` +
                `${artifacts.map(({ name }) => name).join(', ')} — the terser ` +
                `pass has stopped preserving them and consumer bundles will ` +
                `retain code they used to drop`,
        ).toContain('index.js');
        expect(annotated.length).toBeGreaterThan(1);
    });

    describe('one export at a time', () => {
        const bundles = new Map<ExportName, string>();

        beforeAll(async () => {
            for (const name of EXPORTS) {
                bundles.set(name, await bundleConsumer(name));
            }
        }, 120_000);

        it.each(EXPORTS)('re-exports %s', (name) => {
            expect(bundles.get(name)).toMatch(
                new RegExp(String.raw`\b${name}\b`),
            );
        });

        it.each(EXPORTS)('retains %s’s own graph', (name) => {
            expect(bundles.get(name)).toContain(CONSUMERS[name].marker);
        });

        it.each(EXPORTS)('retains no more than %s needs', (name) => {
            const { ceiling } = CONSUMERS[name];
            expect(
                bundles.get(name)?.length,
                `a consumer importing ${name} retains more of this package ` +
                    `than it did when the ceiling was recorded — check whether ` +
                    `the terser pass has stopped preserving @__PURE__ ` +
                    `annotations, or whether the eager graph has grown`,
            ).toBeLessThanOrEqual(ceiling + SLACK);
        });

        it('keeps the stage stylesheet a mounted plugin needs', () => {
            // The one required side effect a bundler could plausibly shake out
            // of the plugin's graph: the stylesheet reaches the bundle as a
            // string literal installed through the SDK style service, not as a
            // CSS asset, so nothing but this notices if it goes.
            expect(bundles.get('AvPlugin')).toContain('.tri-av-stage{');
        });

        it.each(EXPORTS)(
            'leaves the declared peers external for %s',
            (name) => {
                const bundle = bundles.get(name) ?? '';
                // Not every export reaches every peer, so the assertion is that
                // whatever IS reached is reached by bare specifier rather than
                // bundled: a peer that got inlined would put a second Svelte or a
                // second copy of core in the host's application.
                for (const peer of PEERS) {
                    if (!bundle.includes(peer)) continue;
                    expect(bundle).toMatch(
                        new RegExp(
                            String.raw`from\s*["']${peer.replace('/', '\\/')}`,
                        ),
                    );
                }
            },
        );
    });
});
