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
/*
 * A soft alert: the accent tints the fill and the border, and the text is the
 * panel foreground pulled part-way toward the accent.
 *
 * The text colour is derived rather than taken from the --tri-color-*-content
 * tokens, and that is the whole point. Those are ON-ACCENT foregrounds -- Button
 * and Badge pair them with the accent as the BACKGROUND -- so they are dark in
 * every theme, light and dark alike. Against a fill that is only 8% accent over
 * the panel surface they are dark-on-light in a light theme (fine, by luck) and
 * dark-on-dark in a dark one: measured at 1.11:1 in the dark theme and 1.57:1 in
 * dracula, i.e. invisible.
 *
 * Mixing toward --panel-fg instead is correct in both polarities by
 * construction, because --panel-fg is the colour the theme already guarantees
 * against --panel-bg: the text lightens in a dark theme and darkens in a light
 * one, on its own. 45% keeps the hue clearly readable as error or success while
 * measuring at worst 5.8:1 across the four shipped themes, so it clears AA for
 * body text with margin rather than sitting on the threshold.
 *
 * It also makes the neutral alert free: its --alert-color IS --panel-fg, so the
 * mix collapses to plain panel foreground with no special case.
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
    /* transparent, not #fff: a missing surface token must fall back to the
       panel showing through, not to a white card in a dark theme. */
    border: 1px solid
        color-mix(
            in oklab,
            var(--alert-color) 10%,
            var(--tri-input-bg, transparent)
        );
    border-radius: var(--tri-radius-panels, 0.75rem);
    color: color-mix(
        in oklab,
        var(--alert-color) 45%,
        var(--panel-fg, currentColor)
    );
    background: color-mix(
        in oklab,
        var(--alert-color) 8%,
        var(--tri-input-bg, transparent)
    );
    box-shadow: none;
}
.tri-id-alert.is-success {
    --alert-color: var(--tri-color-success, #16a34a);
}
.tri-id-alert.is-error {
    --alert-color: var(--tri-color-error, #dc2626);
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
