import { definePluginStyles } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned global CSS + its style-service install id, shaped
 * by {@link definePluginStyles} into the `STYLES` / `STYLE_ID` exports the
 * activation installs. Class names are namespaced `tri-id-*` since these rules
 * are not Svelte-scoped (they are installed globally into the viewer root).
 *
 * Core-owned-chrome path (ticket 04): core renders the toolbar button and the
 * docked panel's header/title and owns open/close + docking, so this stylesheet
 * carries NO toggle button and NO `position: absolute` — only the layout of the
 * panel *content* (body + footer). The controls themselves are themed by the
 * bundled `@triiiceratops/ui` primitives; these rules only lay out the content
 * and restore `main`'s Panel look with the current `--tri-` theme tokens.
 */
export const { STYLES, STYLE_ID } = definePluginStyles(
    `
.tri-id {
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: 100%;
    color: var(--panel-fg, var(--tri-panel-content, currentColor));
}

.tri-id-body {
    width: 100%;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.tri-id-desc {
    font-size: 0.875rem;
    line-height: 1.25rem;
    margin: 0;
    color: color-mix(in oklab, var(--panel-fg, currentColor) 70%, transparent);
}

.tri-id-fields {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 0.75rem;
}

.tri-id-field {
    width: 100%;
}

.tri-id-label {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.25rem;
    white-space: nowrap;
    font-size: 0.75rem;
    color: color-mix(in oklab, currentColor 60%, transparent);
}

/* The themed Select renders its wrapper with this class; stretch it to fill. */
.tri-id-field-select {
    width: 100%;
}

.tri-id-card {
    display: flex;
    flex-direction: column;
    position: relative;
    border-radius: var(--tri-radius-panels, 0.75rem);
    border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.15));
    background-color: var(--tri-input-bg, #fff);
}

.tri-id-card-body {
    display: flex;
    flex-direction: column;
    flex: auto;
    gap: 0.5rem;
    padding: 1rem;
    font-size: 0.875rem;
}

/*
 * Soft alert: tinted background/border derived from --alert-color, no shadow.
 * The color variant sets --alert-color (drives bg/border) and overrides the
 * text color to the variant's *-content token.
 */
.tri-id-alert {
    --alert-color: var(--panel-fg, currentColor);
    display: grid;
    grid-auto-flow: column;
    grid-template-columns: auto;
    justify-content: start;
    place-items: center start;
    gap: 1rem;
    text-align: start;
    padding-block: 0.5rem;
    padding-inline: 1rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    border: 1px solid
        color-mix(in oklab, var(--alert-color) 10%, var(--tri-input-bg, #fff));
    border-radius: var(--tri-radius-panels, 0.75rem);
    color: var(--panel-fg, currentColor);
    background: color-mix(
        in oklab,
        var(--alert-color) 8%,
        var(--tri-input-bg, #fff)
    );
    box-shadow: none;
}
.tri-id-alert.is-success {
    --alert-color: var(--tri-color-success, #16a34a);
    color: var(--tri-color-success-content, currentColor);
}
.tri-id-alert.is-error {
    --alert-color: var(--tri-color-error, #dc2626);
    color: var(--tri-color-error-content, currentColor);
}

.tri-id-footer {
    width: 100%;
    padding: 1rem;
    border-top: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.15));
}

/* The themed Button renders with this class; size its download glyph. */
.tri-id-download svg {
    width: 1.125rem;
    height: 1.125rem;
    fill: currentColor;
}
`,
    'panel',
);
