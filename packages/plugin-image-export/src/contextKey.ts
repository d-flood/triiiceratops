import type { PluginContext } from '@triiiceratops/plugin-sdk';

/**
 * Shared key for handing the SDK {@link PluginContext} to the panel through
 * Svelte's component-context map. `getContext` returns a plain (non-reactive)
 * value, which is exactly right here: the activation context is stable for the
 * lifetime of a mount (a fresh mount gets a fresh context), so it must not be
 * treated as reactive state. Cross-runtime viewer reactivity is bridged
 * explicitly inside the panel through `context.viewerState.subscribe` /
 * `context.selectors`, never through the plugin runtime's own reactivity reading
 * core's `$state`.
 */
export const PLUGIN_CONTEXT_KEY = Symbol('triiiceratops:plugin-image-download');

/** What `view.mount` passes to the panel through the context map. */
export interface PanelContext {
    /** The SDK activation context (viewer state, selectors, services). */
    readonly context: PluginContext;
}
