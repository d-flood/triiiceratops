// @vitest-environment node
/** Consumer-bundle regression over the built ESM entry and IIFE. */

import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Rollup } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const ENTRY = join(DIST, 'index.js');
const IIFE = join(DIST, 'iife.js');
const PDF_LIB_CHUNK = join(DIST, 'pdf-lib.js');

/** A pdf-lib class name absent from this package's own source. */
const PDF_LIB_MARKER = 'PDFCrossRefStream';

const read = (file: string) =>
    existsSync(file) ? readFileSync(file, 'utf8') : '';

/** The peers the ESM build declares; a consumer's bundler resolves them. */
const PEERS = ['@triiiceratops/plugin-sdk', 'triiiceratops', 'pdf-lib'];

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
        `export { PdfExportPlugin } from ${JSON.stringify(ENTRY)};\n`,
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
            `${ENTRY} is missing — run \`pnpm --filter @triiiceratops/plugin-pdf-export build\``,
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

    it('reaches pdf-lib only through a dynamic import', () => {
        // The one peer a consumer must NOT receive eagerly. pdf-lib is ~500 KB
        // of PDF machinery that a reader who never exports pays nothing for,
        // and the split is invisible in source: a top-level `import` of any
        // pdf-lib symbol anywhere in this package's graph puts the whole
        // library back in the consumer's initial bundle, and every export still
        // works. Asserted on the built entry rather than through
        // `bundleConsumer` above, which leaves pdf-lib external and so cannot
        // see which half of the graph reached it.
        const entry = existsSync(ENTRY) ? readFileSync(ENTRY, 'utf8') : '';
        const specifiers = [...entry.matchAll(/from\s*["']([^"']+)["']/g)].map(
            (match) => match[1],
        );

        expect(specifiers).not.toContain('pdf-lib');
        expect(entry).toMatch(/import\(\s*["']pdf-lib["']\s*\)/);
    });

    describe('bundled into a host application', () => {
        let consumer = '';

        beforeAll(async () => {
            consumer = await bundleConsumer();
        }, 120_000);

        it('re-exports PdfExportPlugin', () => {
            expect(consumer).toMatch(/\bPdfExportPlugin\b/);
        });

        it('imports nothing but the declared peers', () => {
            // What a consumer's bundle may still reference by bare specifier is
            // exactly the declared peers: anything else here is a dependency
            // this package bundled into the host's application by accident.
            // `svelte` is absent from the set: though an optional peer, it is
            // externalized only by the `svelte`-condition build in
            // `dist/svelte/`; this default build bundles its own runtime.
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

        it('keeps the package-owned global stylesheet, minified', () => {
            // The one required side effect a bundler could plausibly shake out of
            // the plugin's graph: the sheet reaches the bundle as a string literal
            // installed through the SDK style service, not as a CSS asset, so
            // nothing but this notices if it goes. The marker is in its MINIFIED
            // shape — no space before the brace — so a build that stopped running
            // `minifyCss` over the `?raw` import fails here too.
            expect(consumer).toContain('.tri-pdf{');
        });
    });
});

describe('the built IIFE leaves pdf-lib to its sibling chunk', () => {
    it('carries no pdf-lib code', () => {
        const iife = read(IIFE);
        expect(iife, `${IIFE} is missing`).not.toBe('');
        expect(iife).not.toContain(PDF_LIB_MARKER);
        expect(iife).toContain('"pdf-lib.js"');
    });

    it('ships pdf-lib as an import-free module beside it', () => {
        const chunk = read(PDF_LIB_CHUNK);
        expect(chunk, `${PDF_LIB_CHUNK} is missing`).toContain(PDF_LIB_MARKER);
        expect(chunk).not.toMatch(/\bimport\s*[({"'*]|\bfrom\s*["']/);
        expect(chunk).toMatch(/\bPDFDocument\b/);
    });
});

describe('the optional svelte peer', () => {
    it('starts at the Svelte version the svelte build is compiled with', () => {
        const manifest = JSON.parse(
            readFileSync(
                resolve(
                    dirname(fileURLToPath(import.meta.url)),
                    '../package.json',
                ),
                'utf8',
            ),
        );
        const { version } = createRequire(import.meta.url)(
            'svelte/package.json',
        ) as { version: string };

        expect(manifest.peerDependencies.svelte).toBe(`^${version}`);
        expect(manifest.peerDependenciesMeta.svelte.optional).toBe(true);
    });
});
