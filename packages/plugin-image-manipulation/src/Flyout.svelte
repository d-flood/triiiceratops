<script lang="ts">
    /*
     * The image-manipulation flyout CONTENT (epic restore-plugin-toolbar-chrome,
     * ticket 03). Core owns the chrome: it renders the toolbar button from
     * `meta.icon`, owns open/close, and anchors + auto-places this content toward
     * the canvas. This component renders ONLY the content into the core-provided
     * container — it draws no toggle button and positions nothing.
     *
     * The look restores `main`'s design: a boxless set of three vertical sliders
     * (a themed range rotated −90°) floating over the canvas above a frosted glass
     * base carrying each slider's icon + percentage and the invert/grayscale/reset
     * actions (tooltip-wrapped).
     *
     * CSP note (why native markup, not the shared `@triiiceratops/ui` Range/Tooltip
     * components): this plugin ships with `emitCss:false`, so any bundled Svelte
     * component's `<style>` is injected at runtime by Svelte's `append_styles`
     * into the document head WITHOUT the page CSP nonce — which a strict
     * `style-src` blocks and reports (the `csp-svelte` packed fixture). The plugin's
     * CSP-safe contract is therefore that ALL of its CSS flows through the
     * nonce-aware SDK style service (`styles.ts`). So the flyout reproduces the ui
     * primitives' EXACT themed look (their CSS, namespaced `tri-im-*`, in
     * `styles.ts`) over native elements, rather than importing components that
     * carry their own `<style>`. Same tokens, same appearance, CSP-safe.
     *
     * Filter state is NOT held here — it lives in the Activation-scoped
     * `FilterController` handed in through Svelte's context map, so it survives the
     * Flyout being closed and reopened and the two resets (canvas change,
     * deactivation) fire whether the Flyout is open or closed.
     *
     * Placement: core sets the growth direction (`up`/`down`/`left`/`right`) as a
     * class on the ancestor `[data-flyout-panel]`. The slider/base stacking flips
     * for a downward flyout purely through the ancestor-keyed CSS in `styles.ts`
     * (the content-only container is detached when this component mounts, so there
     * is no placement value to read here). Tooltips point up (toward the canvas)
     * for the viewer's default inline bottom-bar placement.
     */
    import { getContext } from 'svelte';

    import { PLUGIN_CONTEXT_KEY, type FlyoutContext } from './contextKey';
    import { GLYPHS } from './icons';
    import type { ImageFilters } from './types';

    // The Activation-scoped controller + locale service, handed in by
    // `view.mount`. Plain (non-reactive) values: the controller's own `$state`
    // carries the reactivity this component reads.
    const { controller, locale } = getContext<FlyoutContext>(PLUGIN_CONTEXT_KEY);

    // Active-locale reactivity: bump a tick on change so `t()`-derived labels
    // recompute in the viewer's active locale.
    let localeTick = $state(0);
    const t = (key: string): string => {
        void localeTick;
        return locale.t(key);
    };
    locale.subscribe(() => {
        localeTick++;
    });

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
    ] as const satisfies ReadonlyArray<{
        key: keyof ImageFilters;
        glyph: string;
        label: string;
    }>;
</script>

<div
    class="tri-im-cluster"
    data-tri-im
    role="group"
    aria-label={t('image_adjustments_title')}
>
    <!-- Bare vertical sliders, floating on the canvas side. -->
    <div class="tri-im-sliders">
        {#each sliders as slider (slider.key)}
            <div class="tri-im-cell">
                <div class="tri-im-vwrap">
                    <input
                        type="range"
                        class="tri-im-range tri-im-vrange"
                        min="0"
                        max="200"
                        data-tri-im-slider={slider.key}
                        aria-label={t(slider.label)}
                        title={`${t(slider.label)}: ${controller.filters[slider.key]}%`}
                        value={controller.filters[slider.key]}
                        oninput={(e) =>
                            controller.set(slider.key, +e.currentTarget.value)}
                    />
                </div>
            </div>
        {/each}
    </div>

    <!-- Glass base: slider icons + percentages, then the action row. -->
    <div class="tri-im-base">
        <div class="tri-im-labels">
            {#each sliders as slider (slider.key)}
                <div class="tri-im-cell tri-im-cap">
                    <!-- eslint-disable svelte/no-at-html-tags -- trusted static SVG glyph constant -->
                    <svg viewBox={GLYPHS.viewBox} aria-hidden="true"
                        >{@html slider.glyph}</svg
                    >
                    <!-- eslint-enable svelte/no-at-html-tags -->
                    <span class="tri-im-val"
                        >{controller.filters[slider.key]}%</span
                    >
                </div>
            {/each}
        </div>

        <div class="tri-im-actions">
            <div class="tri-im-cell">
                <span
                    class="tri-im-tooltip top"
                    data-tip={t('image_filters_invert')}
                >
                    <button
                        type="button"
                        class="tri-im-act"
                        data-tri-im-action="invert"
                        class:tri-im-on={controller.filters.invert}
                        aria-pressed={controller.filters.invert}
                        aria-label={t('image_filters_invert')}
                        onclick={() =>
                            controller.set(
                                'invert',
                                !controller.filters.invert,
                            )}
                    >
                        <!-- eslint-disable svelte/no-at-html-tags -- trusted static SVG glyph constant -->
                        <svg viewBox={GLYPHS.viewBox} aria-hidden="true"
                            >{@html GLYPHS.invert}</svg
                        >
                        <!-- eslint-enable svelte/no-at-html-tags -->
                    </button>
                </span>
            </div>
            <div class="tri-im-cell">
                <span
                    class="tri-im-tooltip top"
                    data-tip={t('image_filters_grayscale')}
                >
                    <button
                        type="button"
                        class="tri-im-act"
                        data-tri-im-action="grayscale"
                        class:tri-im-on={controller.filters.grayscale}
                        aria-pressed={controller.filters.grayscale}
                        aria-label={t('image_filters_grayscale')}
                        onclick={() =>
                            controller.set(
                                'grayscale',
                                !controller.filters.grayscale,
                            )}
                    >
                        <!-- eslint-disable svelte/no-at-html-tags -- trusted static SVG glyph constant -->
                        <svg viewBox={GLYPHS.viewBox} aria-hidden="true"
                            >{@html GLYPHS.grayscale}</svg
                        >
                        <!-- eslint-enable svelte/no-at-html-tags -->
                    </button>
                </span>
            </div>
            <div class="tri-im-cell">
                <span
                    class="tri-im-tooltip top"
                    data-tip={t('image_filters_reset')}
                >
                    <button
                        type="button"
                        class="tri-im-act tri-im-reset"
                        data-tri-im-action="reset"
                        disabled={controller.isDefault}
                        aria-label={t('image_filters_reset')}
                        onclick={() => controller.reset()}
                    >
                        <!-- eslint-disable svelte/no-at-html-tags -- trusted static SVG glyph constant -->
                        <svg viewBox={GLYPHS.viewBox} aria-hidden="true"
                            >{@html GLYPHS.reset}</svg
                        >
                        <!-- eslint-enable svelte/no-at-html-tags -->
                    </button>
                </span>
            </div>
        </div>
    </div>
</div>
