import type { PluginContext } from '@triiiceratops/plugin-sdk';

export const PLUGIN_CONTEXT_KEY = Symbol('triiiceratops:plugin-image-download');

export interface PanelContext {
    readonly context: PluginContext;
}
