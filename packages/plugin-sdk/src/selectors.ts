/**
 * Memoized viewer-state selectors: a re-export of the ONE framework-neutral
 * selector runtime core owns (`triiiceratops/selectors`).
 *
 * The implementation lives in core so plugin activations and the React/Vue
 * framework wrappers cannot drift on equality, memoization, cadence, disposal,
 * or error semantics. Each plugin activation gets its OWN runtime (one
 * `ViewerState.subscribe` registration each), and projection/listener failures
 * carry plugin attribution through the `SelectorRuntimeOptions` hooks
 * `runActivation` passes.
 *
 * `triiiceratops/selectors` is a Svelte-free entry point, so re-exporting it
 * keeps the SDK's base entry free of the viewer's Svelte graph.
 */

export { createSelectorRuntime } from 'triiiceratops/selectors';
export type {
    SelectorRuntime,
    SelectorRuntimeOptions,
    SelectorSource,
    SourceSelectors,
} from 'triiiceratops/selectors';
