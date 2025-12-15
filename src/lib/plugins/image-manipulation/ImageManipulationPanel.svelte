<script lang="ts">
    import X from 'phosphor-svelte/lib/X';
    import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';
    import type { ImageFilters } from './types';

    let {
        filters,
        onFilterChange,
        onReset,
        onClose,
    }: {
        filters: ImageFilters;
        onFilterChange: (filters: ImageFilters) => void;
        onReset: () => void;
        onClose: () => void;
    } = $props();

    function updateFilter<K extends keyof ImageFilters>(
        key: K,
        value: ImageFilters[K],
    ) {
        onFilterChange({ ...filters, [key]: value });
    }
</script>

<div
    class="w-72 h-full bg-base-200 border-l border-base-300 shadow-xl flex flex-col"
>
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-base-300">
        <h2 class="text-lg font-semibold">Image Adjustments</h2>
        <button
            class="btn btn-sm btn-ghost btn-circle"
            onclick={onClose}
            aria-label="Close panel"
        >
            <X size={20} />
        </button>
    </div>

    <!-- Sliders -->
    <div class="flex-1 overflow-y-auto p-4 space-y-6">
        <!-- Brightness -->
        <div class="form-control">
            <label class="label" for="brightness-slider">
                <span class="label-text">Brightness</span>
                <span class="label-text-alt">{filters.brightness}%</span>
            </label>
            <input
                id="brightness-slider"
                type="range"
                min="0"
                max="200"
                value={filters.brightness}
                oninput={(e) =>
                    updateFilter('brightness', +e.currentTarget.value)}
                class="range range-sm range-primary"
            />
        </div>

        <!-- Contrast -->
        <div class="form-control">
            <label class="label" for="contrast-slider">
                <span class="label-text">Contrast</span>
                <span class="label-text-alt">{filters.contrast}%</span>
            </label>
            <input
                id="contrast-slider"
                type="range"
                min="0"
                max="200"
                value={filters.contrast}
                oninput={(e) =>
                    updateFilter('contrast', +e.currentTarget.value)}
                class="range range-sm range-secondary"
            />
        </div>

        <!-- Saturation -->
        <div class="form-control">
            <label class="label" for="saturation-slider">
                <span class="label-text">Saturation</span>
                <span class="label-text-alt">{filters.saturation}%</span>
            </label>
            <input
                id="saturation-slider"
                type="range"
                min="0"
                max="200"
                value={filters.saturation}
                oninput={(e) =>
                    updateFilter('saturation', +e.currentTarget.value)}
                class="range range-sm range-accent"
            />
        </div>

        <!-- Effects -->
        <div class="divider">Effects</div>

        <div class="form-control">
            <label class="label cursor-pointer">
                <span class="label-text">Invert Colors</span>
                <input
                    type="checkbox"
                    checked={filters.invert}
                    onchange={(e) =>
                        updateFilter('invert', e.currentTarget.checked)}
                    class="toggle toggle-primary"
                />
            </label>
        </div>

        <div class="form-control">
            <label class="label cursor-pointer">
                <span class="label-text">Grayscale</span>
                <input
                    type="checkbox"
                    checked={filters.grayscale}
                    onchange={(e) =>
                        updateFilter('grayscale', e.currentTarget.checked)}
                    class="toggle toggle-secondary"
                />
            </label>
        </div>
    </div>

    <!-- Footer -->
    <div class="p-4 border-t border-base-300">
        <button class="btn btn-outline btn-block" onclick={onReset}>
            <ArrowCounterClockwise size={20} />
            Reset to Default
        </button>
    </div>
</div>
