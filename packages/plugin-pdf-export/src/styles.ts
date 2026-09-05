import { definePluginStyles } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned global CSS + its style-service install id, shaped
 * by {@link definePluginStyles} into the `STYLES` / `STYLE_ID` exports the
 * activation installs. Class names are namespaced `tri-pdf-*` since these rules
 * are not Svelte-scoped.
 *
 * Chrome ownership: core owns
 * the toolbar button and the docked panel chrome (surface, sticky header, radius,
 * open/close). These rules therefore style ONLY the panel's content body — no
 * self-positioned toggle, no `position: absolute`, no panel surface/border. The
 * body layout mirrors core's former `PdfExportPanel` embedded look; the range
 * `Select`s and export `Button` are themed by the shared `@triiiceratops/ui`
 * primitives, so no bespoke control styling lives here. Tokens are the current
 * `--tri-` theme variables.
 */
export const { STYLES, STYLE_ID } = definePluginStyles(
    `
.tri-pdf {
    display: flex;
    flex-direction: column;
    min-height: 0;
    color: var(--panel-fg, inherit);
}

.tri-pdf-body {
    width: 100%;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.tri-pdf-description {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: color-mix(in oklab, var(--panel-fg, currentColor) 70%, transparent);
}

.tri-pdf-fields {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 0.75rem;
}
.tri-pdf-field {
    width: 100%;
}
.tri-pdf-label {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.375rem;
    white-space: nowrap;
    font-size: 0.8125rem;
    color: color-mix(in oklab, currentColor 60%, transparent);
}
.tri-pdf-select {
    width: 100%;
}

.tri-pdf-card {
    border-radius: var(--tri-radius-panels, 0.5rem);
    background-color: var(--tri-input-bg, rgb(0 0 0 / 0.03));
    border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.12));
    display: flex;
    flex-direction: column;
}
.tri-pdf-card-body {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.875rem;
}
.tri-pdf-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.875rem;
    line-height: 1.25rem;
}
.tri-pdf-summary-label {
    color: color-mix(in oklab, var(--panel-fg, currentColor) 70%, transparent);
}
.tri-pdf-summary-count {
    font-weight: 600;
}

.tri-pdf-alert {
    --alert-color: var(--panel-fg, currentColor);
    border-radius: var(--tri-radius-panels, 0.5rem);
    border: 1px solid color-mix(in oklab, var(--alert-color) 10%, var(--tri-input-bg, transparent));
    background: color-mix(in oklab, var(--alert-color) 8%, var(--tri-input-bg, transparent));
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    text-align: start;
}
.tri-pdf-alert-info {
    --alert-color: var(--tri-color-primary, #2563eb);
}
.tri-pdf-alert-success {
    --alert-color: var(--tri-color-success, #16a34a);
}
.tri-pdf-alert-error {
    --alert-color: var(--tri-color-error, #dc2626);
}

.tri-pdf-footer {
    width: 100%;
    padding: 1rem;
    border-top: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.12));
}
.tri-pdf-export {
    width: 100%;
}
.tri-pdf-export-icon {
    width: 1.125rem;
    height: 1.125rem;
    fill: currentColor;
}
`,
    'panel',
);
