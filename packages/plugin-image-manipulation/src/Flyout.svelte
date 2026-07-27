<script lang="ts">
    /*
     * The image-manipulation flyout CONTENT (epic restore-plugin-toolbar-chrome,
     * ticket 03). Core owns the chrome: it renders the toolbar button from
     * `meta.icon`, owns open/close, and anchors + auto-places this content toward
     * the canvas. This component renders ONLY the content into the core-provided
     * container — it draws no toggle button and positions nothing.
     *
     * The look restores `main`'s design: a boxless set of three vertical sliders
     * (the shared `@triiiceratops/ui` themed Range rotated −90°) floating over the
     * canvas above a frosted glass base carrying each slider's icon + percentage
     * and the invert/grayscale/reset actions (each wrapped in the shared
     * `@triiiceratops/ui` Tooltip).
     *
     * CSP-safe idiomatic Svelte: this component and the `@triiiceratops/ui`
     * primitives it renders keep ordinary Svelte-scoped style blocks. The build
     * (`emitCss:true` + `bundledCss()`, see vite.config.ts) EXTRACTS that scoped
     * CSS into the `virtual:tri-bundled-css` module instead of letting Svelte's
     * `append_styles` inject an un-nonced style element (which a strict `style-src`
     * blocks and reports — the `csp-svelte` packed fixture). The plugin entry
     * installs the extracted CSS through the nonce-aware SDK style service, so the
     * scoped rules reach the DOM CSP-safe. Only genuinely-global, ancestor-keyed
     * placement rules live in `styles.ts`.
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

    import { Range, Tooltip } from '@triiiceratops/ui';

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

<div class="tri-im-cluster" role="group" aria-label={t('image_adjustments_title')}>
    <!-- Bare vertical sliders, floating on the canvas side. -->
    <div class="tri-im-sliders">
        {#each sliders as slider (slider.key)}
            <div class="tri-im-cell">
                <div class="tri-im-vwrap">
                    <Range
                        class="tri-im-vrange"
                        min="0"
                        max="200"
                        size="xs"
                        data-tri-im-slider={slider.key}
                        value={controller.filters[slider.key]}
                        aria-label={t(slider.label)}
                        title={`${t(slider.label)}: ${controller.filters[slider.key]}%`}
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
                    <span class="tri-im-val">{controller.filters[slider.key]}%</span>
                </div>
            {/each}
        </div>

        <div class="tri-im-actions">
            <div class="tri-im-cell">
                <Tooltip tip={t('image_filters_invert')} placement="top">
                    <button
                        type="button"
                        class="tri-im-act"
                        data-tri-im-action="invert"
                        class:tri-im-on={controller.filters.invert}
                        aria-pressed={controller.filters.invert}
                        aria-label={t('image_filters_invert')}
                        onclick={() =>
                            controller.set('invert', !controller.filters.invert)}
                    >
                        <!-- eslint-disable svelte/no-at-html-tags -- trusted static SVG glyph constant -->
                        <svg viewBox={GLYPHS.viewBox} aria-hidden="true"
                            >{@html GLYPHS.invert}</svg
                        >
                        <!-- eslint-enable svelte/no-at-html-tags -->
                    </button>
                </Tooltip>
            </div>
            <div class="tri-im-cell">
                <Tooltip tip={t('image_filters_grayscale')} placement="top">
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
                </Tooltip>
            </div>
            <div class="tri-im-cell">
                <Tooltip tip={t('image_filters_reset')} placement="top">
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
                </Tooltip>
            </div>
        </div>
    </div>
</div>

<style>
    /* ---- Boxless cluster layout ---- */
    .tri-im-cluster {
        --tri-im-col-w: 2.25rem;
        --tri-im-col-gap: 0rem;
        --tri-im-pad-x: 0.25rem;
        display: inline-flex;
        flex-direction: column;
        align-items: stretch;
        color: var(--tri-toolbar-content, currentColor);
        /* A slight frosted backing on the whole flyout so the bare sliders stay
           readable when overlaid on the image. Lighter than the .tri-im-base
           glass, which sits on top and keeps its own look. */
        border-radius: var(--tri-radius-toolbar, 0.75rem);
        background-color: color-mix(
            in oklab,
            var(--tri-toolbar-bg, #fff) 35%,
            transparent
        );
    }

    /* All three rows share the same 3-column grid so sliders, icons and buttons
       line up in their columns. */
    .tri-im-sliders,
    .tri-im-labels,
    .tri-im-actions {
        display: grid;
        grid-template-columns: repeat(3, var(--tri-im-col-w));
        column-gap: var(--tri-im-col-gap);
        justify-content: center;
        padding-inline: var(--tri-im-pad-x);
    }
    .tri-im-sliders {
        padding-block: 0.25rem;
    }

    .tri-im-cell {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    /* The same glass treatment used by the toolbar/nav bars. The blur/fill live
       on a ::before layer (not directly on .tri-im-base, which also carries
       `border`) — combining `backdrop-filter` and `border` on the same element
       makes the browser paint the border in its own compositing pass, on top of
       nested content like the action buttons' tooltips regardless of z-index. */
    .tri-im-base {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        padding-block: 0.375rem;
        border-radius: var(--tri-radius-toolbar, 0.75rem);
        border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.15));
        color: var(--tri-toolbar-content, currentColor);
        box-shadow: var(
            --ui-chrome-shadow,
            0 10px 15px -3px rgb(0 0 0 / 0.15),
            0 4px 6px -4px rgb(0 0 0 / 0.15)
        );
    }
    .tri-im-base::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        border-radius: calc(var(--tri-radius-toolbar, 0.75rem) - 1px);
        background-color: color-mix(
            in oklab,
            var(--tri-toolbar-bg, #fff) 70%,
            transparent
        );
        backdrop-filter: blur(8px);
    }

    /* A slim vertical slider built by rotating the shared themed Range. The
       rotation + track/handle overrides target the Range's own (separately
       scoped) element, so they must reach across the component boundary with
       `:global`. */
    .tri-im-vwrap {
        position: relative;
        width: 1.5rem;
        height: 6.5rem;
        /* Let clicks in the empty space around the thin slider fall through to
           the image; only the slider itself is interactive. */
        pointer-events: none;
    }
    .tri-im-vwrap :global(.tri-im-vrange) {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 6.5rem;
        transform: translate(-50%, -50%) rotate(-90deg);
        pointer-events: auto;
        /* A more opaque track color so it reads over any image. */
        --range-bg: color-mix(
            in oklab,
            var(--tri-toolbar-bg, #fff) 90%,
            transparent
        );
        /* Keep the fill/handle the primary accent so it stays distinct from the
           neutral glass track in every theme. */
        --range-progress: var(--tri-color-primary, #2563eb);
        filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.35));
    }

    .tri-im-cap {
        flex-direction: column;
        line-height: 1;
        gap: 0.125rem;
    }
    .tri-im-cap svg {
        width: 1.125rem;
        height: 1.125rem;
        fill: currentColor;
        opacity: 0.85;
    }
    .tri-im-val {
        font-size: 0.625rem;
        font-variant-numeric: tabular-nums;
        opacity: 0.85;
        white-space: nowrap;
    }

    .tri-im-act {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--ui-hit, 2.25rem);
        height: var(--ui-hit, 2.25rem);
        padding: 0;
        border: none;
        border-radius: var(--tri-radius-buttons, 0.5rem);
        background: transparent;
        color: inherit;
        cursor: pointer;
        -webkit-user-select: none;
        user-select: none;
    }
    .tri-im-act:hover {
        background-color: color-mix(in oklab, currentColor 12%, transparent);
    }
    .tri-im-act.tri-im-on {
        background-color: var(--tri-color-primary, #2563eb);
        color: var(--tri-color-primary-content, #fff);
    }
    .tri-im-act.tri-im-reset:disabled {
        opacity: 0.4;
        cursor: default;
    }
    .tri-im-act.tri-im-reset:disabled:hover {
        background: transparent;
    }
    .tri-im-act svg {
        width: 1.125rem;
        height: 1.125rem;
        fill: currentColor;
    }
</style>
