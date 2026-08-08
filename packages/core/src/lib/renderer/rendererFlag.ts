/**
 * The development-only build flag that selects which renderer the viewer mounts
 * (spec §Rollout). This is the "expand" half of the epic's expand–contract
 * sequence: while it exists, the OpenSeadragon path and the first-party
 * Canvas2D path both live in the repository so they can be compared directly.
 * Ticket 18 contracts — this module, the flag, and the OpenSeadragon path are
 * deleted together.
 *
 * ## Why a `globalThis` read rather than Vite's `import.meta` env object
 *
 * That object is banned in shipped `src/lib` source — a consumer bundler with
 * no Vite-style `define` must be able to compile it (the ban is enforced by
 * `logging/distribution-cleanup.guard.test.ts`, which is also why this comment
 * spells the name around rather than out). A *bare* `__FLAG__` identifier has
 * the same problem in reverse: without a `define` it is a ReferenceError.
 *
 * A property read off `globalThis` is safe in both worlds:
 *
 * - **With** a `define` (see `rendererFlag.build.ts`, wired into the published
 *   artifact configs) the whole member expression is textually replaced by a
 *   literal *before* Rollup parses the module, so `CANVAS_RENDERER` folds to a
 *   constant and the unselected renderer is tree-shaken out of the bundle
 *   entirely. Neither path costs bytes in the other's build.
 * - **Without** one it is an ordinary (undefined) global read: no
 *   ReferenceError, no `import.meta` anything, and the flag reads `false`, so
 *   any toolchain that just compiles the source gets the shipping renderer.
 *
 * ## Why it is read once, at module scope
 *
 * The dev server and vitest deliberately leave the flag *undefined*, which
 * makes it a real mutable global there — that is what lets an e2e spec select
 * the Canvas2D renderer per test with
 * `page.addInitScript(() => { globalThis.__TRIIICERATOPS_CANVAS_RENDERER__ = true; })`
 * while the rest of the suite keeps exercising the OpenSeadragon path in the
 * same run. Reading once at module scope (rather than per render) is what keeps
 * the expression foldable in the builds that *do* define it.
 *
 * Reading `globalThis` is SSR-safe: it is defined in Node. No `window`,
 * `document`, or `navigator` is touched here or anywhere else in the renderer's
 * module graph at module scope.
 */

declare global {
    var __TRIIICERATOPS_CANVAS_RENDERER__: boolean | undefined;
}

/** True when this build mounts the first-party Canvas2D renderer. */
export const CANVAS_RENDERER: boolean =
    globalThis.__TRIIICERATOPS_CANVAS_RENDERER__ === true;
