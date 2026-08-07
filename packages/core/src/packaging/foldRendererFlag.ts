/*
 * Fold the development-only renderer flag to a literal in the published dist
 * (build-time tooling — lives in src/packaging, never published). Runs in
 * `build:lib` AFTER svelte-package.
 *
 * Why this step exists
 * --------------------
 * `src/lib/renderer/rendererFlag.ts` reads
 * `globalThis.__TRIIICERATOPS_CANVAS_RENDERER__` precisely so a Vite `define`
 * can replace the whole member expression with a literal before Rollup parses
 * it. That works for every BUNDLED artifact (the element IIFE, the element ESM
 * build). It does not work for the npm package's main entry: `dist/index.js` and
 * friends come from `svelte-package`, which compiles per file and never bundles,
 * so no `define` reaches them.
 *
 * Left alone, the published tarball therefore ships a runtime global read that a
 * consumer's bundler cannot fold — which means an installed, production viewer
 * can be switched onto the in-progress Canvas2D renderer by anything that sets
 * `globalThis.__TRIIICERATOPS_CANVAS_RENDERER__ = true` before the module
 * evaluates. That is a mutable switch into unfinished code on a published
 * artifact, not a development affordance.
 *
 * So the published module gets the same treatment the bundled ones get, just
 * applied textually after the fact: the read becomes the build's literal, the
 * flag can no longer be satisfied at runtime, and a consumer's bundler sees an
 * ordinary constant it can propagate. Ticket 18 deletes the flag, this step, and
 * the OpenSeadragon path together.
 *
 * Run directly: `node ./src/packaging/foldRendererFlag.ts` (Node strips types).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The packaged module this step rewrites, relative to `dist/`. */
export const RENDERER_FLAG_DIST_FILE = 'renderer/rendererFlag.js';

/**
 * The runtime read as `svelte-package` emits it: type stripping leaves the
 * initializer verbatim, so this is a stable target. Whitespace is tolerated;
 * anything else is drift, and drift must fail the build rather than silently
 * publish an unfolded flag (see `foldRendererFlagSource`).
 */
const FLAG_READ =
    /globalThis\s*\.\s*__TRIIICERATOPS_CANVAS_RENDERER__\s*===\s*true/g;

/**
 * Replace the flag's runtime read with `selected`'s literal.
 *
 * The rest of the module — its documentation, its exported name, its type — is
 * untouched, so the only thing that changes is that the answer is now decided at
 * build time.
 *
 * @throws if the expected read is absent, which means the source moved and the
 * published artifact would otherwise keep its mutable global.
 */
export function foldRendererFlagSource(
    source: string,
    selected: boolean,
): string {
    FLAG_READ.lastIndex = 0;
    if (!FLAG_READ.test(source)) {
        throw new Error(
            'fold-renderer-flag: no runtime flag read found in ' +
                `${RENDERER_FLAG_DIST_FILE}. The renderer flag's spelling ` +
                'changed; update src/packaging/foldRendererFlag.ts, or the ' +
                'published package will ship a mutable renderer switch.',
        );
    }

    FLAG_READ.lastIndex = 0;
    return source.replace(FLAG_READ, String(selected));
}

/**
 * True when the environment selects the first-party Canvas2D renderer.
 *
 * The same spelling `rendererFlag.build.ts` uses for the bundled artifacts —
 * stated again here rather than imported because that file sits outside this
 * (composite) TypeScript program's `src/**` root. Both must agree; they are one
 * environment-variable comparison each.
 */
function canvasRendererSelected(): boolean {
    return process.env.TRIIICERATOPS_RENDERER === 'canvas';
}

/** Rewrite the flag module under `distDir`. Returns the file rewritten. */
export function foldRendererFlag(distDir: string, selected: boolean): string {
    const target = `${distDir}/${RENDERER_FLAG_DIST_FILE}`;
    if (!existsSync(target)) {
        throw new Error(
            `fold-renderer-flag: ${target} not found — did svelte-package run?`,
        );
    }

    const folded = foldRendererFlagSource(
        readFileSync(target, 'utf8'),
        selected,
    );
    writeFileSync(target, folded, 'utf8');
    return target;
}

// CLI entry: fold ./dist relative to the package root (this file is src/packaging/).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const selected = canvasRendererSelected();
    foldRendererFlag(
        fileURLToPath(new URL('../../dist', import.meta.url)),
        selected,
    );
    console.log(
        `fold-renderer-flag: pinned the renderer flag to ${selected} in dist/${RENDERER_FLAG_DIST_FILE}`,
    );
}
