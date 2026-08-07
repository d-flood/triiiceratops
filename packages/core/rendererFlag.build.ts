/**
 * Build-side half of the development-only renderer flag (spec §Rollout); the
 * runtime half is `src/lib/renderer/rendererFlag.ts`, which explains the
 * `globalThis` shape.
 *
 * Applied to the **bundled** published artifacts — `vite.config.element.ts`,
 * `vite.config.element-esm.ts`, and `vite.config.lib.ts` — where the flag must
 * be a compile-time literal so the unselected renderer is dead-code eliminated.
 *
 * It does NOT cover the npm package's main entry, which `svelte-package`
 * compiles per file with no bundler and therefore no define;
 * `src/packaging/foldRendererFlag.ts` folds that output textually instead, so
 * the published tarball cannot be switched onto the in-progress renderer at
 * runtime either.
 *
 * Deliberately NOT applied to `vite.config.ts` (the dev server and vitest):
 * leaving the flag undefined there keeps it a real mutable global, so both
 * renderers are present and either can be selected per page — which is the whole
 * point of keeping them side by side during the epic, and what lets one e2e run
 * exercise both.
 *
 * The demo configs (`vite.config.demo.ts` and friends) also leave it undefined,
 * and — unlike the dev server — their output IS published, to `docs/` and from
 * there to the project site. Those bundles consequently contain both renderers
 * and the same mutable global. That is tolerated only because the demo is a
 * demo: it ships no npm surface and integrates nothing. It is not an argument
 * for leaving the tarball or the element builds unfolded, and ticket 18 removes
 * the question entirely.
 *
 * Select the Canvas2D renderer for a build with the environment variable:
 *
 *     TRIIICERATOPS_RENDERER=canvas pnpm build:element
 *
 * Anything else (including unset) selects OpenSeadragon, so every ordinary
 * release build ships exactly one renderer and none of the other's bytes.
 */

export const CANVAS_RENDERER_GLOBAL =
    'globalThis.__TRIIICERATOPS_CANVAS_RENDERER__';

/** True when the environment selects the first-party Canvas2D renderer. */
export function canvasRendererSelected(): boolean {
    return process.env.TRIIICERATOPS_RENDERER === 'canvas';
}

/** Vite `define` entry pinning the flag to a literal for a published build. */
export function rendererFlagDefine(): Record<string, string> {
    return {
        [CANVAS_RENDERER_GLOBAL]: JSON.stringify(canvasRendererSelected()),
    };
}
