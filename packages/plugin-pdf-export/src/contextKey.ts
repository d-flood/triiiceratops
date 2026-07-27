import type { PluginContext } from '@triiiceratops/plugin-sdk';

import type { PdfExportConfig } from './types';

/**
 * Shared key for handing the SDK {@link PluginContext} (plus this activation's
 * consumer config) to the panel through Svelte's component-context map.
 * `getContext` returns a plain (non-reactive) value, which is exactly right
 * here: the activation context and config are stable for the lifetime of a mount
 * (a fresh mount gets a fresh context), so they must not be treated as reactive
 * state.
 */
export const PLUGIN_CONTEXT_KEY = Symbol('triiiceratops:plugin-pdf-export');

/** What `view.mount` passes to the panel through the context map. */
export interface PanelContext {
    /** The SDK activation context (viewer state, selectors, services). */
    readonly context: PluginContext;
    /** The consumer configuration this plugin instance was created with. */
    readonly config: PdfExportConfig;
}
