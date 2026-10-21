import type { PluginContext } from '@triiiceratops/plugin-sdk';

import { DEFAULT_FILTERS, type ImageFilters } from './types';

export interface FilterController {
    readonly filters: ImageFilters;
    /** The view's clockwise turn, in degrees. */
    readonly rotation: number;
    readonly isDefault: boolean;
    set<K extends keyof ImageFilters>(key: K, value: ImageFilters[K]): void;
    /** Turn the view a quarter: `1` clockwise, `-1` counter-clockwise. */
    rotate(direction: 1 | -1): void;
    reset(): void;
    dispose(): void;
}

export function createFilterController(
    context: PluginContext,
): FilterController {
    const { viewerState, selectors } = context;

    let filters = $state<ImageFilters>({ ...DEFAULT_FILTERS });
    const rotationSelector = selectors.select((s) => s.viewportRotation);
    let rotation = $state(rotationSelector.get());

    function apply(): void {
        viewerState.setImageAdjustments(filters);
    }

    function turnTo(next: number): void {
        viewerState.setViewportRotation(next);
        rotation = viewerState.viewportRotation;
    }

    function resetAll(): void {
        filters = { ...DEFAULT_FILTERS };
        apply();
        turnTo(0);
    }

    const unsubscribeCanvas = selectors
        .select((s) => s.canvasId)
        .subscribe(resetAll);
    const unsubscribeRotation = rotationSelector.subscribe((value) => {
        rotation = value;
    });

    return {
        get filters(): ImageFilters {
            return filters;
        },
        get rotation(): number {
            return rotation;
        },
        get isDefault(): boolean {
            return (
                filters.brightness === 100 &&
                filters.contrast === 100 &&
                filters.saturation === 100 &&
                !filters.invert &&
                !filters.grayscale &&
                rotation === 0
            );
        },
        set<K extends keyof ImageFilters>(
            key: K,
            value: ImageFilters[K],
        ): void {
            filters = { ...filters, [key]: value };
            apply();
        },
        rotate(direction: 1 | -1): void {
            turnTo(viewerState.viewportRotation + 90 * direction);
        },
        reset: resetAll,
        dispose(): void {
            unsubscribeCanvas();
            unsubscribeRotation();
            viewerState.resetImageAdjustments();
            viewerState.setViewportRotation(0);
        },
    };
}
