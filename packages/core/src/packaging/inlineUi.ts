/*
 * Post-package inlining of the shared UI primitives (build-time tooling — lives
 * in src/packaging, never published). Runs in `build:lib` AFTER svelte-package
 * + pruneDist.
 *
 * Why: the UI primitives were extracted into the internal, UNPUBLISHED
 * `@triiiceratops/ui` package (restore-plugin-toolbar-chrome ticket 01). Core's
 * `components/ui/index.ts` is a re-export shim (`export … from '@triiiceratops/ui'`)
 * so in-core call sites and dev/test/check resolve the primitives from source.
 * But `@sveltejs/package` copies src/lib VERBATIM and does not bundle
 * dependencies, so the shim lands in `dist/components/ui/index.js` as a bare
 * `export … from '@triiiceratops/ui'`. Since that package is never published, a
 * consumer of core's tarball could not resolve it.
 *
 * The contract (SPEC.md / ticket 01) is that the primitives are BUNDLED INTO
 * core — shipped as Svelte source, never an externalized runtime dependency of
 * the published artifact. Core already ships every component as `.svelte`
 * source, so this step reproduces exactly what `dist/components/ui/` held before
 * the extraction: it copies the primitive `.svelte` sources in beside the shim
 * and rewrites the barrel to import them relatively — leaving no reference to
 * the `@triiiceratops/ui` specifier anywhere in the published dist. Mirrors the
 * existing `cp -r ./src/paraglide ./src/lib/paraglide` inlining of generated
 * code in `build:lib`.
 *
 * Run directly: `node ./src/packaging/inlineUi.ts` (Node strips the types).
 */
import {
    readdirSync,
    copyFileSync,
    writeFileSync,
    existsSync,
    mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to the extracted `@triiiceratops/ui` package's source dir. */
function uiSourceDir(): string {
    // From packages/core/src/packaging/ up to packages/, then into ui/src.
    return fileURLToPath(new URL('../../../ui/src', import.meta.url));
}

/** The `dist/components/ui` directory this step fills in. */
function distUiDir(): string {
    return fileURLToPath(new URL('../../dist/components/ui', import.meta.url));
}

/** Build the barrel body (relative `.svelte` re-exports) for the given files. */
export function renderBarrel(svelteFiles: readonly string[]): string {
    const lines = [...svelteFiles]
        .sort()
        .map((file) => {
            const name = file.replace(/\.svelte$/, '');
            return `export { default as ${name} } from './${file}';`;
        })
        .join('\n');
    return `${lines}\n`;
}

/**
 * Copy the primitive `.svelte` sources into `distUi` and rewrite the barrel so
 * the published dist references them relatively (no `@triiiceratops/ui`
 * specifier). Returns the list of inlined component filenames.
 */
export function inlineUi(srcUi: string, distUi: string): string[] {
    if (!existsSync(srcUi)) {
        throw new Error(
            `inline-ui: @triiiceratops/ui source not found at ${srcUi}`,
        );
    }
    mkdirSync(distUi, { recursive: true });

    const svelteFiles = readdirSync(srcUi).filter((f) => f.endsWith('.svelte'));
    for (const file of svelteFiles) {
        copyFileSync(join(srcUi, file), join(distUi, file));
    }

    const barrel = renderBarrel(svelteFiles);
    const header =
        '// Barrel inlined at build time from the internal @triiiceratops/ui\n' +
        '// package (see src/packaging/inlineUi.ts). The primitives ship as\n' +
        '// Svelte source bundled into core, never as a runtime dependency.\n';
    writeFileSync(join(distUi, 'index.js'), header + barrel, 'utf8');
    writeFileSync(join(distUi, 'index.d.ts'), barrel, 'utf8');

    return svelteFiles;
}

// CLI entry.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const inlined = inlineUi(uiSourceDir(), distUiDir());
    console.log(
        `inline-ui: inlined ${inlined.length} @triiiceratops/ui primitive(s) into dist/components/ui/`,
    );
}
