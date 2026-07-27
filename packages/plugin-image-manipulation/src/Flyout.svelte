<script lang="ts">
    /*
     * The image-manipulation flyout. Framework-neutral seam in, Svelte inside:
     * this component is compiled INTO the plugin package (its own bundled Svelte
     * runtime), and mounted through `view.mount` — it never imports core's Svelte
     * runtime or `svelte/internal`, and reaches viewer state only through the
     * SDK-owned `PluginContext` (selectors, locale, ui), never Svelte context.
     */
    import { getContext, onDestroy } from 'svelte';

    import { whenOsdReady } from '@triiiceratops/plugin-sdk';

    import { applyFilters } from './filters';
    import { PLUGIN_CONTEXT_KEY, type FlyoutContext } from './contextKey';
    import { GLYPHS, SLIDERS_ICON } from './icons';
    import { DEFAULT_FILTERS, type ImageFilters } from './types';

    // The activation context + teardown signal, handed in through Svelte's
    // context map by `view.mount`. `getContext` returns them as a plain,
    // non-reactive value; the context is stable for this mount's lifetime, so
    // capturing its services as locals is correct (a fresh mount gets a fresh
    // context).
    const { context, signal } = getContext<FlyoutContext>(PLUGIN_CONTEXT_KEY);
    const { viewerState, selectors, locale, ui } = context;

    let open = $state(false);
    let filters = $state<ImageFilters>({ ...DEFAULT_FILTERS });
    // The raw OSD viewer, once ready. `null` until OSD readiness fires.
    let osd = $state<unknown>(viewerState.osdViewer ?? null);

    // Active-locale reactivity: bump a tick on change so `t()`-derived labels
    // recompute in the viewer's active locale.
    let localeTick = $state(0);
    const t = (key: string): string => {
        void localeTick;
        return locale.t(key);
    };

    // Gate the first application on OSD readiness via the SDK helper, then keep
    // in sync through the memoized selector so a later viewer swap is picked up.
    // The wait is aborted by the view cleanup (`signal`) on deactivation, so an
    // OSD that never becomes ready leaves no dangling subscription. The selector
    // and locale subscriptions below are dropped by the SDK on deactivation
    // (selector-runtime disposal / locale-service tracking).
    void whenOsdReady(viewerState, { signal })
        .then((viewer) => {
            osd = viewer;
        })
        .catch(() => {
            // Aborted on teardown (or OSD never became ready) — nothing to do.
        });

    selectors.select((s) => s.osdViewer).subscribe((viewer) => {
        osd = viewer;
    });

    // Reset filters when a new image (canvas) is opened.
    selectors.select((s) => s.canvasId).subscribe(() => {
        filters = { ...DEFAULT_FILTERS };
    });

    locale.subscribe(() => {
        localeTick++;
    });

    onDestroy(() => {
        // Leave no residual filter on the shared OSD canvas after teardown.
        if (osd) applyFilters(osd, { ...DEFAULT_FILTERS });
    });

    // Apply whenever filters or OSD readiness change (gated on `osd` truthy).
    $effect(() => {
        if (osd) applyFilters(osd, filters);
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
    ): void {
        filters = { ...filters, [key]: value };
    }

    function reset(): void {
        filters = { ...DEFAULT_FILTERS };
    }

    // Render the toolbar glyph through the SDK UI service so core owns the
    // `<svg>` wrapper, sizing, color, and accessibility.
    function renderGlyph(node: HTMLElement): { destroy: () => void } {
        const cleanup = ui.renderIcon(SLIDERS_ICON, node);
        return { destroy: cleanup };
    }

    const sliders = [
        {
            key: 'brightness',
            glyph: GLYPHS.brightness,
            label: 'image_filters_brightness',
        },
        {
            key: 'contrast',
            glyph: GLYPHS.contrast,
            label: 'image_filters_contrast',
        },
        {
            key: 'saturation',
            glyph: GLYPHS.saturation,
            label: 'image_filters_saturation',
        },
    ] as const;
</script>

<div class="tri-im" data-tri-im>
    {#if open}
        <div
            class="tri-im-flyout"
            role="group"
            aria-label={t('image_adjustments_title')}
        >
            <div class="tri-im-sliders">
                {#each sliders as slider (slider.key)}
                    <div class="tri-im-row">
                        <!-- eslint-disable svelte/no-at-html-tags -- trusted static SVG glyph constant -->
                        <svg viewBox={GLYPHS.viewBox} aria-hidden="true"
                            >{@html slider.glyph}</svg
                        >
                        <!-- eslint-enable svelte/no-at-html-tags -->
                        <input
                            type="range"
                            min="0"
                            max="200"
                            data-tri-im-slider={slider.key}
                            aria-label={t(slider.label)}
                            value={filters[slider.key]}
                            oninput={(e) =>
                                setFilter(slider.key, +e.currentTarget.value)}
                        />
                        <span class="tri-im-val">{filters[slider.key]}%</span>
                    </div>
                {/each}
            </div>

            <div class="tri-im-actions">
                <button
                    type="button"
                    class="tri-im-act"
                    data-tri-im-action="invert"
                    aria-pressed={filters.invert}
                    aria-label={t('image_filters_invert')}
                    title={t('image_filters_invert')}
                    onclick={() => setFilter('invert', !filters.invert)}
                >
                    <!-- eslint-disable svelte/no-at-html-tags -- trusted static SVG glyph constant -->
                    <svg viewBox={GLYPHS.viewBox} aria-hidden="true"
                        >{@html GLYPHS.invert}</svg
                    >
                    <!-- eslint-enable svelte/no-at-html-tags -->
                </button>
                <button
                    type="button"
                    class="tri-im-act"
                    data-tri-im-action="grayscale"
                    aria-pressed={filters.grayscale}
                    aria-label={t('image_filters_grayscale')}
                    title={t('image_filters_grayscale')}
                    onclick={() => setFilter('grayscale', !filters.grayscale)}
                >
                    <!-- eslint-disable svelte/no-at-html-tags -- trusted static SVG glyph constant -->
                    <svg viewBox={GLYPHS.viewBox} aria-hidden="true"
                        >{@html GLYPHS.grayscale}</svg
                    >
                    <!-- eslint-enable svelte/no-at-html-tags -->
                </button>
                <button
                    type="button"
                    class="tri-im-act"
                    data-tri-im-action="reset"
                    disabled={isDefault}
                    aria-label={t('image_filters_reset')}
                    title={t('image_filters_reset')}
                    onclick={reset}
                >
                    <!-- eslint-disable svelte/no-at-html-tags -- trusted static SVG glyph constant -->
                    <svg viewBox={GLYPHS.viewBox} aria-hidden="true"
                        >{@html GLYPHS.reset}</svg
                    >
                    <!-- eslint-enable svelte/no-at-html-tags -->
                </button>
            </div>
        </div>
    {/if}

    <button
        type="button"
        class="tri-im-toggle"
        data-tri-im-toggle
        aria-expanded={open}
        aria-label={t('image_adjustments_title')}
        title={t('image_adjustments_title')}
        onclick={() => (open = !open)}
        use:renderGlyph
    ></button>
</div>
