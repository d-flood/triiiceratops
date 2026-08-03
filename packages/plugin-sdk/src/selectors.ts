/**
 * Memoized viewer-state selectors (ticket 07), now a re-export of the ONE
 * framework-neutral selector runtime core owns (`triiiceratops/selectors`).
 *
 * The implementation moved into core so plugin activations and the React/Vue
 * framework wrappers cannot drift on equality, memoization, cadence, disposal,
 * or error semantics. Nothing about this module's public shape changed: the SDK
 * still exports `createSelectorRuntime` and `SelectorRuntime` from its base
 * entry with the same signatures, plugin activations still get their OWN runtime
 * (one `ViewerState.subscribe` registration each), and this activation's
 * projection/listener failures still carry plugin attribution through the
 * `SelectorRuntimeOptions` hooks `runActivation` passes.
 *
 * `triiiceratops/selectors` is a Svelte-free entry point, so re-exporting it
 * keeps the SDK's base entry free of the viewer's Svelte graph.
 */

export { createSelectorRuntime } from 'triiiceratops/selectors';
export type {
    SelectorRuntime,
    SelectorRuntimeOptions,
} from 'triiiceratops/selectors';
