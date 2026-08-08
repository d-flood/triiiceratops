/**
 * The image-manipulation filter controller — the plugin's **Activation-scoped**
 * filter state (epic restore-plugin-toolbar-chrome, ticket 03).
 *
 * A fresh controller is created once per activation, inside `view.mount`, so its
 * state is per-viewer (never module scope — ADR 0007 isolation) and lives ABOVE
 * the mounted Svelte component. Because it outlives the component, the last
 * slider positions survive the Flyout being closed and reopened, and the two
 * resets (canvas change, deactivation) take effect whether the Flyout is open or
 * closed.
 *
 * Filters are applied through `viewerState.setImageAdjustments`, a first-party
 * command. This plugin used to reach through the renderer pass-through for the
 * drawer's DOM node and write a CSS filter string onto it; the command replaces
 * that outright (SPEC.md §Public API). Three consequences worth stating,
 * because they are why the command exists rather than being a rename:
 *
 * - **No readiness gate.** The adjustment set lives in viewer state and is
 *   replayed onto a renderer that mounts later, so there is nothing to wait for
 *   and no dangling readiness subscription to abort. The whole `whenOsdReady`
 *   dance, and the selector that re-applied on a viewer swap, are gone.
 * - **No DOM node is handed out**, so the plugin cannot hold a stale one across
 *   a canvas change that reopens the world.
 * - **It survives a renderer change**, which is the point of the epic.
 */

import type { PluginContext } from '@triiiceratops/plugin-sdk';

import { DEFAULT_FILTERS, type ImageFilters } from './types';

/** The Activation-scoped filter state handed to the Flyout. */
export interface FilterController {
    /** The current filter values (reactive; the Flyout reads them). */
    readonly filters: ImageFilters;
    /** `true` when every filter is at its neutral default (reset disabled). */
    readonly isDefault: boolean;
    /** Set one filter value and apply the result to the image. */
    set<K extends keyof ImageFilters>(key: K, value: ImageFilters[K]): void;
    /** Reset every filter to its default and clear the adjustment. */
    reset(): void;
    /**
     * Tear the controller down on deactivation: drop the viewer-state
     * subscription and leave NO residual adjustment on the shared viewer.
     */
    dispose(): void;
}

/**
 * Create the Activation-scoped {@link FilterController} for one viewer.
 *
 * @param context The SDK activation context (viewer state, selectors).
 */
export function createFilterController(
    context: PluginContext,
): FilterController {
    const { viewerState, selectors } = context;

    let filters = $state<ImageFilters>({ ...DEFAULT_FILTERS });

    function apply(): void {
        viewerState.setImageAdjustments(filters);
    }

    // Reset filters when a new image (canvas) is opened — effective whether the
    // Flyout is open or closed, so one image's adjustment never bleeds onto
    // another.
    const unsubscribeCanvas = selectors
        .select((s) => s.canvasId)
        .subscribe(() => {
            filters = { ...DEFAULT_FILTERS };
            apply();
        });

    return {
        get filters(): ImageFilters {
            return filters;
        },
        get isDefault(): boolean {
            return (
                filters.brightness === 100 &&
                filters.contrast === 100 &&
                filters.saturation === 100 &&
                !filters.invert &&
                !filters.grayscale
            );
        },
        set<K extends keyof ImageFilters>(
            key: K,
            value: ImageFilters[K],
        ): void {
            filters = { ...filters, [key]: value };
            apply();
        },
        reset(): void {
            filters = { ...DEFAULT_FILTERS };
            apply();
        },
        dispose(): void {
            unsubscribeCanvas();
            // Leave no residual adjustment on the shared viewer after teardown.
            viewerState.resetImageAdjustments();
        },
    };
}
