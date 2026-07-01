<script lang="ts">
    import { getContext } from 'svelte';
    import {
        VIEWER_STATE_KEY,
        type ViewerState,
    } from '../../state/viewer.svelte';
    import { DEFAULT_FILTERS, type ImageFilters } from './types';
    import { applyFilters } from './filters';
    import * as m from '../../paraglide/messages';
    import { Range, Tooltip } from '../../components/ui';
    import Sun from 'phosphor-svelte/lib/Sun';
    import CircleHalf from 'phosphor-svelte/lib/CircleHalf';
    import Drop from 'phosphor-svelte/lib/Drop';
    import SelectionInverse from 'phosphor-svelte/lib/SelectionInverse';
    import Palette from 'phosphor-svelte/lib/Palette';
    import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';

    // `placement` is the flyout growth direction supplied by the toolbar; the
    // sliders sit on the canvas side (above for an upward flyout).
    let { placement = 'up' }: { placement?: string; close?: () => void } =
        $props();
    const dir = $derived(placement === 'down' ? 'down' : 'up');
    // Tooltips point toward the canvas: above the base for an upward flyout,
    // below it for a downward one.
    const tipPlacement = $derived(dir === 'down' ? 'bottom' : 'top');

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    let filters = $state<ImageFilters>({ ...DEFAULT_FILTERS });

    // Apply filters to the OSD canvas whenever they change. Because the flyout
    // popover stays mounted (hidden, not destroyed) the filters keep applying
    // even while the rail is closed.
    $effect(() => {
        if (viewerState?.osdViewer) {
            applyFilters(viewerState.osdViewer, filters);
        }
    });

    // Reset filters when a new image is opened (canvas change).
    let lastCanvasId = $state(viewerState?.canvasId);
    $effect(() => {
        if (viewerState?.canvasId !== lastCanvasId) {
            lastCanvasId = viewerState?.canvasId;
            filters = { ...DEFAULT_FILTERS };
        }
    });

    const isDefault = $derived(
        filters.brightness === 100 &&
            filters.contrast === 100 &&
            filters.saturation === 100 &&
            !filters.invert &&
            !filters.grayscale,
    );

    function setFilter<K extends keyof ImageFilters>(
        key: K,
        value: ImageFilters[K],
    ) {
        filters = { ...filters, [key]: value };
    }

    function reset() {
        filters = { ...DEFAULT_FILTERS };
    }

    const sliders = [
        {
            key: 'brightness',
            icon: Sun,
            label: m.image_filters_brightness,
            color: 'neutral',
        },
        {
            key: 'contrast',
            icon: CircleHalf,
            label: m.image_filters_contrast,
            color: 'neutral',
        },
        {
            key: 'saturation',
            icon: Drop,
            label: m.image_filters_saturation,
            color: 'neutral',
        },
    ] as const;
</script>

<div
    class="cluster"
    data-dir={dir}
    role="group"
    aria-label={m.image_adjustments_title()}
>
    <!-- Bare vertical sliders, floating on the canvas side. -->
    <div class="sliders">
        {#each sliders as s (s.key)}
            <div class="cell">
                <div class="vwrap">
                    <Range
                        class="vrange"
                        min="0"
                        max="200"
                        size="xs"
                        color={s.color}
                        value={filters[s.key]}
                        aria-label={s.label()}
                        title={`${s.label()}: ${filters[s.key]}%`}
                        oninput={(e) =>
                            setFilter(s.key, +e.currentTarget.value)}
                    />
                </div>
            </div>
        {/each}
    </div>

    <!-- Glass base: slider icons + percentages, then the toggle/reset row. -->
    <div class="base">
        <div class="labels">
            {#each sliders as s (s.key)}
                {@const Icon = s.icon}
                <div class="cell cap">
                    <Icon size={18} />
                    <span class="val">{filters[s.key]}%</span>
                </div>
            {/each}
        </div>

        <div class="actions">
            <div class="cell">
                <Tooltip tip={m.image_filters_invert()} placement={tipPlacement}>
                    <button
                        type="button"
                        class="act"
                        class:on={filters.invert}
                        aria-pressed={filters.invert}
                        aria-label={m.image_filters_invert()}
                        onclick={() => setFilter('invert', !filters.invert)}
                    >
                        <SelectionInverse size={18} />
                    </button>
                </Tooltip>
            </div>
            <div class="cell">
                <Tooltip
                    tip={m.image_filters_grayscale()}
                    placement={tipPlacement}
                >
                    <button
                        type="button"
                        class="act"
                        class:on={filters.grayscale}
                        aria-pressed={filters.grayscale}
                        aria-label={m.image_filters_grayscale()}
                        onclick={() => setFilter('grayscale', !filters.grayscale)}
                    >
                        <Palette size={18} />
                    </button>
                </Tooltip>
            </div>
            <div class="cell">
                <Tooltip tip={m.image_filters_reset()} placement={tipPlacement}>
                    <button
                        type="button"
                        class="act reset"
                        disabled={isDefault}
                        aria-label={m.image_filters_reset()}
                        onclick={reset}
                    >
                        <ArrowCounterClockwise size={18} />
                    </button>
                </Tooltip>
            </div>
        </div>
    </div>
</div>

<style>
    .cluster {
        --col-w: 2.25rem;
        --col-gap: 0rem;
        --pad-x: 0.25rem;
        display: inline-flex;
        flex-direction: column;
        align-items: stretch;
        color: var(--toolbar-content);
    }
    /* Downward flyout (top toolbar): sliders hang below the glass base. */
    .cluster[data-dir='down'] {
        flex-direction: column-reverse;
    }

    /* All three rows share the same 3-column grid so sliders, icons and
       buttons line up in their columns. */
    .sliders,
    .labels,
    .actions {
        display: grid;
        grid-template-columns: repeat(3, var(--col-w));
        column-gap: var(--col-gap);
        justify-content: center;
        padding-inline: var(--pad-x);
    }

    .sliders {
        padding-block: 0.25rem;
    }

    .cell {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    /* The same glass treatment used by the toolbar/nav bars. */
    .base {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        padding-block: 0.375rem;
        border-radius: var(--radius-toolbar);
        border: 1px solid var(--surface-border);
        background-color: color-mix(
            in oklab,
            var(--toolbar-bg) 70%,
            transparent
        );
        color: var(--toolbar-content);
        backdrop-filter: blur(8px);
        box-shadow: var(
            --ui-chrome-shadow,
            0 10px 15px -3px #0000001a,
            0 4px 6px -4px #0000001a
        );
    }
    .cluster[data-dir='down'] .base {
        flex-direction: column-reverse;
    }

    /* A slim vertical slider built by rotating the themed horizontal Range. */
    .vwrap {
        position: relative;
        width: 1.5rem;
        height: 6.5rem;
        /* Let clicks in the empty space around the thin slider fall through to
           the image; only the slider itself is interactive. */
        pointer-events: none;
    }
    .vwrap :global(.vrange) {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 6.5rem;
        transform: translate(-50%, -50%) rotate(-90deg);
        pointer-events: auto;
        /* Same glass color + blur as the bar, so the track reads over any image. */
        --range-bg: color-mix(in oklab, var(--toolbar-bg) 70%, transparent);
        filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.35));
    }
    .vwrap :global(.vrange::-webkit-slider-runnable-track) {
        backdrop-filter: blur(8px);
    }
    .vwrap :global(.vrange::-moz-range-track) {
        backdrop-filter: blur(8px);
    }

    .cap {
        flex-direction: column;
        line-height: 1;
        gap: 0.125rem;
    }
    .val {
        font-size: 0.625rem;
        font-variant-numeric: tabular-nums;
        opacity: 0.85;
        white-space: nowrap;
    }

    .act {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--ui-hit, 2.25rem);
        height: var(--ui-hit, 2.25rem);
        padding: 0;
        border: none;
        border-radius: var(--radius-field);
        background: transparent;
        color: inherit;
        cursor: pointer;
        -webkit-user-select: none;
        user-select: none;
    }
    .act:hover {
        background-color: color-mix(in oklab, currentcolor 12%, transparent);
    }
    .act.on {
        background-color: var(--color-primary);
        color: var(--color-primary-content);
    }
    .act.reset:disabled {
        opacity: 0.4;
        cursor: default;
    }
    .act.reset:disabled:hover {
        background: transparent;
    }
</style>
