/**
 * The image-manipulation filter controller — the plugin's **Activation-scoped**
 * filter state and OSD wiring (epic restore-plugin-toolbar-chrome, ticket 03).
 *
 * A fresh controller is created once per activation, inside `view.mount`, so its
 * state is per-viewer (never module scope — ADR 0007 isolation) and lives ABOVE
 * the mounted Svelte component. Because it outlives the component, the last
 * slider positions survive the Flyout being closed and reopened, and the two
 * resets (canvas change, deactivation) take effect whether the Flyout is open or
 * closed.
 *
 * Filters are written to the raw OSD canvas as a STATIC inline style through the
 * OSD pass-through (ADR 0009): `apply()` runs only on an actual change (a slider
 * move, a reset, or OSD becoming ready), never on a timer or standing effect, so
 * closing the Flyout leaves the last adjustment visible (no "re-apply while
 * closed" loop) until it is reset on canvas change or deactivation.
 */

import type { PluginContext } from '@triiiceratops/plugin-sdk';
import { whenOsdReady } from '@triiiceratops/plugin-sdk';

import { applyFilters } from './filters';
import { DEFAULT_FILTERS, type ImageFilters } from './types';

/** The Activation-scoped filter state + OSD wiring handed to the Flyout. */
export interface FilterController {
    /** The current filter values (reactive; the Flyout reads them). */
    readonly filters: ImageFilters;
    /** `true` when every filter is at its neutral default (reset disabled). */
    readonly isDefault: boolean;
    /** Set one filter value and apply the result to the OSD canvas. */
    set<K extends keyof ImageFilters>(key: K, value: ImageFilters[K]): void;
    /** Reset every filter to its default and clear the canvas filter. */
    reset(): void;
    /**
     * Tear the controller down on deactivation: drop the viewer-state
     * subscriptions and leave NO residual filter on the shared OSD canvas.
     */
    dispose(): void;
}

/**
 * Create the Activation-scoped {@link FilterController} for one viewer.
 *
 * @param context The SDK activation context (viewer state, selectors).
 * @param signal Aborted by the view cleanup on deactivation, so an OSD that
 *   never becomes ready leaves no dangling `whenOsdReady` subscription.
 */
export function createFilterController(
    context: PluginContext,
    signal: AbortSignal,
): FilterController {
    const { viewerState, selectors } = context;

    let filters = $state<ImageFilters>({ ...DEFAULT_FILTERS });
    // The raw OSD viewer, once ready. `null` until OSD readiness fires.
    let osd: unknown = viewerState.osdViewer ?? null;

    // Write the current filters to the OSD canvas as a static inline style.
    // A no-op until OSD is ready; passing the defaults clears the filter.
    function apply(): void {
        if (osd) applyFilters(osd, filters);
    }

    // Gate the first application on OSD readiness via the SDK helper, then keep
    // in sync through the memoized selector so a later viewer swap is picked up.
    // The wait is aborted by the view cleanup (`signal`) on deactivation.
    void whenOsdReady(viewerState, { signal })
        .then((viewer) => {
            osd = viewer;
            apply();
        })
        .catch(() => {
            // Aborted on teardown (or OSD never became ready) — nothing to do.
        });

    const unsubscribeOsd = selectors
        .select((s) => s.osdViewer)
        .subscribe((viewer) => {
            osd = viewer;
            apply();
        });

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
        set<K extends keyof ImageFilters>(key: K, value: ImageFilters[K]): void {
            filters = { ...filters, [key]: value };
            apply();
        },
        reset(): void {
            filters = { ...DEFAULT_FILTERS };
            apply();
        },
        dispose(): void {
            unsubscribeOsd();
            unsubscribeCanvas();
            // Leave no residual filter on the shared OSD canvas after teardown.
            if (osd) applyFilters(osd, { ...DEFAULT_FILTERS });
        },
    };
}
