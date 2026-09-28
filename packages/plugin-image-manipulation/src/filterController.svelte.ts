import type { PluginContext } from '@triiiceratops/plugin-sdk';

import { DEFAULT_FILTERS, type ImageFilters } from './types';

export interface FilterController {
    readonly filters: ImageFilters;
    readonly isDefault: boolean;
    set<K extends keyof ImageFilters>(key: K, value: ImageFilters[K]): void;
    reset(): void;
    dispose(): void;
}

export function createFilterController(
    context: PluginContext,
): FilterController {
    const { viewerState, selectors } = context;

    let filters = $state<ImageFilters>({ ...DEFAULT_FILTERS });

    function apply(): void {
        viewerState.setImageAdjustments(filters);
    }

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
            viewerState.resetImageAdjustments();
        },
    };
}
