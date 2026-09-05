/**
 * `triiiceratops/selectors` — the core-owned, framework-neutral selector
 * runtime (CONTEXT.md **Selector**, **Selector cadence**; ADR 0008, ADR 0011).
 *
 * A published entry point of its own because it must be importable WITHOUT the
 * viewer's Svelte graph: `@triiiceratops/plugin-sdk` re-exports it to plugin
 * authors, and core's own framework wrappers build on it. Nothing here imports
 * Svelte, the renderer, or the plugin SDK.
 */

export { createSelectorRuntime } from './runtime.js';
export type {
    SelectorCadence,
    SelectorProjection,
    SelectorProjectionOptions,
    SelectorRuntime,
    SelectorRuntimeOptions,
    SelectorSource,
    SourceSelectors,
} from './runtime.js';
