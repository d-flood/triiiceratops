import type { PluginContext } from '@triiiceratops/plugin-sdk';

import type { AvStageManager } from './stages.svelte';

/**
 * Shared key for handing the SDK {@link PluginContext} and this activation's
 * stage manager to the panel through Svelte's component-context map.
 * `getContext` returns a plain (non-reactive) value, which is right for both:
 * each is stable for the lifetime of a mount, and the manager carries its own
 * reactive `views`.
 */
export const PLUGIN_CONTEXT_KEY = Symbol('triiiceratops:plugin-av');

/** What `view.mount` passes to the panel through the context map. */
export interface PanelContext {
    readonly context: PluginContext;
    readonly stages: AvStageManager;
}
