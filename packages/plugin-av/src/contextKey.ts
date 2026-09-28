import type { PluginContext } from '@triiiceratops/plugin-sdk';

import type { AvStageManager } from './stages.svelte';

export const PLUGIN_CONTEXT_KEY = Symbol('triiiceratops:plugin-av');

export interface PanelContext {
    readonly context: PluginContext;
    readonly stages: AvStageManager;
}
