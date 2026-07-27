import type { PluginContext } from '@triiiceratops/plugin-sdk';

/**
 * Shared key for handing the SDK {@link PluginContext} (plus a teardown signal)
 * to the flyout through Svelte's component-context map. `getContext` returns a
 * plain (non-reactive) value, which is exactly right here: the activation
 * context is stable for the lifetime of a mount (a fresh mount gets a fresh
 * context), so it must not be treated as reactive state.
 */
export const PLUGIN_CONTEXT_KEY = Symbol(
    'triiiceratops:plugin-image-manipulation',
);

/** What `view.mount` passes to the flyout through the context map. */
export interface FlyoutContext {
    /** The SDK activation context (viewer state, selectors, services). */
    readonly context: PluginContext;
    /**
     * Aborted by the view cleanup on deactivation, so the flyout's
     * `whenOsdReady` wait is cancelled synchronously (no leaked subscription if
     * OSD never became ready).
     */
    readonly signal: AbortSignal;
}
