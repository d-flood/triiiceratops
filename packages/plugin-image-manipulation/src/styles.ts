import { definePluginStyles } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned global CSS + its style-service install id, shaped
 * by {@link definePluginStyles} into the `STYLES` / `STYLE_ID` exports the
 * activation installs. Class names are namespaced `tri-im-*` since these rules
 * are not Svelte-scoped.
 *
 * This restores `main`'s boxless Flyout design (epic
 * restore-plugin-toolbar-chrome, ticket 03): three vertical sliders (a themed
 * range, rotated −90°) floating on the canvas side above a frosted glass base
 * that carries each slider's icon + percentage and the invert/grayscale/reset
 * actions. There is NO box/border around the sliders and NO `position: absolute`
 * — core owns the toolbar button, the anchored container, and its placement.
 *
 * The `.tri-im-range` and `.tri-im-tooltip` blocks reproduce the shared
 * `@triiiceratops/ui` Range/Tooltip primitives' EXACT styling (same `--tri-`
 * theme tokens, same `--range-*` internals, same tooltip glass + tail) but
 * installed through the nonce-aware SDK style service instead of a bundled
 * component `<style>`. That is load-bearing for CSP: a component `<style>` would
 * be injected by Svelte's `append_styles` without the page nonce and blocked by
 * a strict `style-src` (the `csp-svelte` packed fixture); routing every rule
 * through the style service keeps the plugin CSP-safe.
 *
 * Placement is core-supplied as a class on the ancestor `[data-flyout-panel]`.
 * The default (upward flyout, viewer's inline bottom bar) stacks the sliders
 * ABOVE the base; a downward flyout (top toolbar) flips both the cluster and the
 * base so the sliders still hang toward the canvas.
 */
export const { STYLES, STYLE_ID } = definePluginStyles(
    `
/* ---- Themed range (reproduces the shared UI Range primitive, size "xs") ---- */
.tri-im-range {
    -webkit-appearance: none;
    appearance: none;
    --range-thumb: var(--tri-input-bg);
    --range-thumb-size: calc(var(--tri-size-selector, 0.25rem) * 4);
    --range-progress: currentColor;
    --range-fill: 1;
    --range-p: 0.25rem;
    --range-bg: color-mix(in oklab, currentColor 10%, #0000);
    cursor: pointer;
    vertical-align: middle;
    --radius-selector-max: calc(var(--tri-radius-selector, 0.5rem) * 3);
    border-radius: calc(
        var(--tri-radius-selector, 0.5rem) +
            min(var(--range-p), var(--radius-selector-max))
    );
    width: clamp(3rem, 20rem, 100%);
    height: var(--range-thumb-size);
    background-color: #0000;
    border: none;
    overflow: hidden;
}
.tri-im-range:focus {
    outline: none;
}
.tri-im-range:focus-visible {
    outline-offset: 2px;
    outline: 2px solid;
}
.tri-im-range::-webkit-slider-runnable-track {
    background-color: var(--range-bg);
    border-radius: var(--tri-radius-selector, 0.5rem);
    width: 100%;
    height: calc(var(--range-thumb-size) * 0.5);
}
.tri-im-range::-webkit-slider-thumb {
    box-sizing: border-box;
    border-radius: calc(
        var(--tri-radius-selector, 0.5rem) +
            min(var(--range-p), var(--radius-selector-max))
    );
    background-color: var(--range-thumb);
    height: var(--range-thumb-size);
    width: var(--range-thumb-size);
    border: var(--range-p) solid;
    -webkit-appearance: none;
    appearance: none;
    color: var(--range-progress);
    box-shadow:
        0 -1px oklch(0% 0 0 / calc(var(--tri-depth, 1) * 0.1)) inset,
        0 8px 0 -4px oklch(100% 0 0 / calc(var(--tri-depth, 1) * 0.1)) inset,
        0 1px
            color-mix(
                in oklab,
                currentColor calc(var(--tri-depth, 1) * 10%),
                #0000
            ),
        0 0 0 2rem var(--range-thumb) inset,
        calc(
                (var(--range-dir, 1) * -100rem) -
                    (var(--range-dir, 1) * var(--range-thumb-size) / 2)
            )
            0 0 calc(100rem * var(--range-fill));
    position: relative;
    top: 50%;
    transform: translateY(-50%);
}
.tri-im-range::-moz-range-track {
    background-color: var(--range-bg);
    border-radius: var(--tri-radius-selector, 0.5rem);
    width: 100%;
    height: calc(var(--range-thumb-size) * 0.5);
}
.tri-im-range::-moz-range-thumb {
    box-sizing: border-box;
    border-radius: calc(
        var(--tri-radius-selector, 0.5rem) +
            min(var(--range-p), var(--radius-selector-max))
    );
    height: var(--range-thumb-size);
    width: var(--range-thumb-size);
    border: var(--range-p) solid;
    color: var(--range-progress);
    box-shadow:
        0 -1px oklch(0% 0 0 / calc(var(--tri-depth, 1) * 0.1)) inset,
        0 8px 0 -4px oklch(100% 0 0 / calc(var(--tri-depth, 1) * 0.1)) inset,
        0 1px
            color-mix(
                in oklab,
                currentColor calc(var(--tri-depth, 1) * 10%),
                #0000
            ),
        0 0 0 2rem var(--range-thumb) inset,
        calc(
                (var(--range-dir, 1) * -100rem) -
                    (var(--range-dir, 1) * var(--range-thumb-size) / 2)
            )
            0 0 calc(100rem * var(--range-fill));
    background-color: currentColor;
    position: relative;
    top: 50%;
}
.tri-im-range:disabled {
    cursor: not-allowed;
    opacity: 0.3;
}

/* ---- Themed tooltip (reproduces the shared UI Tooltip primitive, "top") ---- */
.tri-im-tooltip {
    --tt-bg: var(--tri-color-neutral, #262626);
    --tt-fg: var(--tri-color-neutral-content, #fff);
    --tt-off: calc(100% + 0.5rem);
    --tt-tail: calc(100% + 1px + 0.25rem);
    display: inline-block;
    position: relative;
}
.tri-im-tooltip[data-tip]:not([data-tip=''])::before {
    border-radius: var(--tri-radius-buttons, 0.5rem);
    text-align: center;
    white-space: normal;
    max-width: 20rem;
    color: var(--tt-fg);
    opacity: 0;
    background-color: var(--tt-bg);
    pointer-events: none;
    z-index: 2;
    content: attr(data-tip);
    width: max-content;
    padding-block: 0.25rem;
    padding-inline: 0.5rem;
    font-size: 0.875rem;
    line-height: 1.25;
    position: absolute;
}
.tri-im-tooltip[data-tip]:not([data-tip=''])::after {
    opacity: 0;
    background-color: var(--tt-bg);
    content: '';
    pointer-events: none;
    --mask-tooltip: url("data:image/svg+xml,%3Csvg width='10' height='4' viewBox='0 0 8 4' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0.500009 1C3.5 1 3.00001 4 5.00001 4C7 4 6.5 1 9.5 1C10 1 10 0.499897 10 0H0C-1.99338e-08 0.5 0 1 0.500009 1Z' fill='black'/%3E%3C/svg%3E%0A");
    width: 0.625rem;
    height: 0.25rem;
    mask-position: -1px 0;
    mask-repeat: no-repeat;
    mask-image: var(--mask-tooltip);
    display: block;
    position: absolute;
}
@media (prefers-reduced-motion: no-preference) {
    .tri-im-tooltip[data-tip]::before,
    .tri-im-tooltip[data-tip]::after {
        transition:
            opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) 75ms,
            transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) 75ms;
    }
}
.tri-im-tooltip[data-tip]:not([data-tip='']):hover::before,
.tri-im-tooltip[data-tip]:not([data-tip='']):hover::after,
.tri-im-tooltip[data-tip]:not([data-tip='']):has(:focus-visible)::before,
.tri-im-tooltip[data-tip]:not([data-tip='']):has(:focus-visible)::after {
    opacity: 1;
    --tt-pos: 0rem;
}
.tri-im-tooltip.top::before {
    transform: translateX(-50%) translateY(var(--tt-pos, 0.25rem));
    inset: auto auto var(--tt-off) 50%;
}
.tri-im-tooltip.top::after {
    transform: translateX(-50%) translateY(var(--tt-pos, 0.25rem));
    inset: auto auto var(--tt-tail) 50%;
}

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
       readable when overlaid on the image. Lighter than the .tri-im-base glass,
       which sits on top and keeps its own look. */
    border-radius: var(--tri-radius-toolbar, 0.75rem);
    background-color: color-mix(
        in oklab,
        var(--tri-toolbar-bg, #fff) 35%,
        transparent
    );
}
/* Downward flyout (top toolbar): sliders hang below the glass base. */
[data-flyout-panel].down .tri-im-cluster {
    flex-direction: column-reverse;
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

/* The same glass treatment used by the toolbar/nav bars. The blur/fill live on
   a ::before layer (not directly on .tri-im-base, which also carries \`border\`)
   — combining \`backdrop-filter\` and \`border\` on the same element makes the
   browser paint the border in its own compositing pass, on top of nested
   content like the action buttons' tooltips regardless of z-index. */
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
[data-flyout-panel].down .tri-im-base {
    flex-direction: column-reverse;
}

/* A slim vertical slider built by rotating the themed range. */
.tri-im-vwrap {
    position: relative;
    width: 1.5rem;
    height: 6.5rem;
    /* Let clicks in the empty space around the thin slider fall through to the
       image; only the slider itself is interactive. */
    pointer-events: none;
}
.tri-im-vrange {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 6.5rem;
    transform: translate(-50%, -50%) rotate(-90deg);
    pointer-events: auto;
    /* A more opaque track color so it reads over any image. */
    --range-bg: color-mix(in oklab, var(--tri-toolbar-bg, #fff) 90%, transparent);
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
`,
    'flyout',
);
