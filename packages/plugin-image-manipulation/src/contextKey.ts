import type { PluginLocaleService } from '@triiiceratops/plugin-sdk';

import type { FilterController } from './filterController.svelte';

/**
 * Shared key for handing the Activation-scoped {@link FilterController} and the
 * per-viewer locale service to the Flyout through Svelte's component-context
 * map. `getContext` returns a plain (non-reactive) value, which is exactly right
 * here: both are stable for the lifetime of a mount (a fresh mount gets a fresh
 * activation), so they must not be treated as reactive state — the controller's
 * own `$state` carries the reactivity the Flyout reads.
 */
export const PLUGIN_CONTEXT_KEY = Symbol(
    'triiiceratops:plugin-image-manipulation',
);

/** What `view.mount` passes to the Flyout through the context map. */
export interface FlyoutContext {
    /** The Activation-scoped filter state + viewer wiring (survives close→reopen). */
    readonly controller: FilterController;
    /** The per-viewer locale service (active-locale-aware string resolution). */
    readonly locale: PluginLocaleService;
}
