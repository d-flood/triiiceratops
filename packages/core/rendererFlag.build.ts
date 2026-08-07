/**
 * Build-side half of the development-only renderer flag (spec §Rollout); the
 * runtime half is `src/lib/renderer/rendererFlag.ts`, which explains the
 * `globalThis` shape.
 *
 * Applied to the configs that produce **published artifacts**, where the flag
 * must be a compile-time literal so the unselected renderer is dead-code
 * eliminated. Deliberately NOT applied to `vite.config.ts` (the dev server and
 * vitest) or the demo configs: leaving the flag undefined there keeps it a real
 * mutable global, so both renderers are present and either can be selected per
 * page — which is the whole point of keeping them side by side during the epic.
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
