import type { PluginLocaleService } from '@triiiceratops/plugin-sdk';

import type { FilterController } from './filterController.svelte';

export const PLUGIN_CONTEXT_KEY = Symbol(
    'triiiceratops:plugin-image-manipulation',
);

export interface FlyoutContext {
    readonly controller: FilterController;
    readonly locale: PluginLocaleService;
}
