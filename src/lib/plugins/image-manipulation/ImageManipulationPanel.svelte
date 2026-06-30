<script lang="ts">
    import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';
    import * as m from '../../paraglide/messages';
    import { Button, Range, Toggle } from '../../components/ui';
    import type { ImageFilters } from './types';

    let {
        filters,
        onFilterChange,
        onReset,
        embedded = false,
    }: {
        filters: ImageFilters;
        onFilterChange: (filters: ImageFilters) => void;
        onReset: () => void;
        embedded?: boolean;
    } = $props();

    function updateFilter<K extends keyof ImageFilters>(
        key: K,
        value: ImageFilters[K],
    ) {
        onFilterChange({ ...filters, [key]: value });
    }

</script>

<div class="panel" data-panel-id="image-manipulation" class:standalone={!embedded}>
    {#if !embedded}
        <div class="header">
            <h2 class="title">{m.image_adjustments_title()}</h2>
        </div>
    {/if}

    <!-- Sliders -->
    <div class="sliders" class:scroll={!embedded}>
        <!-- Brightness -->
        <div class="field">
            <label class="label" for="brightness-slider">
                <span>{m.image_filters_brightness()}</span>
                <span>{filters.brightness}%</span>
            </label>
            <Range
                id="brightness-slider"
                min="0"
                max="200"
                size="sm"
                color="primary"
                value={filters.brightness}
                oninput={(e) =>
                    updateFilter('brightness', +e.currentTarget.value)}
            />
        </div>

        <!-- Contrast -->
        <div class="field">
            <label class="label" for="contrast-slider">
                <span>{m.image_filters_contrast()}</span>
                <span>{filters.contrast}%</span>
            </label>
            <Range
                id="contrast-slider"
                min="0"
                max="200"
                size="sm"
                color="secondary"
                value={filters.contrast}
                oninput={(e) =>
                    updateFilter('contrast', +e.currentTarget.value)}
            />
        </div>

        <!-- Saturation -->
        <div class="field">
            <label class="label" for="saturation-slider">
                <span>{m.image_filters_saturation()}</span>
                <span>{filters.saturation}%</span>
            </label>
            <Range
                id="saturation-slider"
                min="0"
                max="200"
                size="sm"
                color="accent"
                value={filters.saturation}
                oninput={(e) =>
                    updateFilter('saturation', +e.currentTarget.value)}
            />
        </div>

        <!-- Effects -->
        <div class="divider">{m.image_filters_effects()}</div>

        <div class="field">
            <label class="label clickable">
                <span>{m.image_filters_invert()}</span>
                <Toggle
                    class="toggle-primary"
                    checked={filters.invert}
                    onchange={(e) =>
                        updateFilter('invert', e.currentTarget.checked)}
                />
            </label>
        </div>

        <div class="field">
            <label class="label clickable">
                <span>{m.image_filters_grayscale()}</span>
                <Toggle
                    class="toggle-secondary"
                    checked={filters.grayscale}
                    onchange={(e) =>
                        updateFilter('grayscale', e.currentTarget.checked)}
                />
            </label>
        </div>
    </div>

    <!-- Footer -->
    <div class="footer">
        <Button outline class="block-btn" onclick={onReset}>
            <ArrowCounterClockwise size={20} />
            {m.image_filters_reset()}
        </Button>
    </div>
</div>

<style>
    .panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
        width: 100%;
    }

    .panel.standalone {
        height: 100%;
        width: 18rem;
        background-color: var(--panel-surface);
        border-left-width: 1px;
        border-left-style: solid;
        border-left-color: var(--surface-border);
        box-shadow:
            0 20px 25px -5px #0000001a,
            0 8px 10px -6px #0000001a;
    }

    .header {
        display: flex;
        align-items: center;
        padding: 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--surface-border);
    }

    .title {
        font-size: 1.125rem;
        line-height: 1.75rem;
        font-weight: 600;
    }

    .sliders {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        width: 100%;
        padding: 1rem;
    }

    .sliders.scroll {
        flex: 1 1 0%;
        overflow-y: auto;
    }

    .label {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        white-space: nowrap;
        color: color-mix(in oklab, currentcolor 60%, transparent);
    }

    .label.clickable {
        cursor: pointer;
    }

    .divider {
        display: flex;
        flex-direction: row;
        align-items: center;
        align-self: stretch;
        height: 1rem;
        /* The 1.5rem vertical rhythm around the divider is provided by the
           .sliders flex gap, so the divider itself carries no margin. */
        margin: 0;
        white-space: nowrap;
        --divider-color: color-mix(
            in oklab,
            var(--panel-fg) 10%,
            transparent
        );
    }

    .divider:not(:empty) {
        gap: 1rem;
    }

    .divider::before,
    .divider::after {
        content: '';
        flex-grow: 1;
        width: 100%;
        height: 0.125rem;
        background-color: var(--divider-color);
    }

    .footer {
        width: 100%;
        padding: 1rem;
        border-top-width: 1px;
        border-top-style: solid;
        border-top-color: var(--surface-border);
    }

    .footer :global(.block-btn) {
        width: 100%;
    }

    /* toggle-primary / toggle-secondary: colored knob only when checked */
    .label :global(.toggle-primary:checked),
    .label :global(.toggle-primary[aria-checked='true']) {
        --input-color: var(--color-primary);
    }

    .label :global(.toggle-secondary:checked),
    .label :global(.toggle-secondary[aria-checked='true']) {
        --input-color: var(--color-primary);
    }
</style>
