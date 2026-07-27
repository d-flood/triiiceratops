import { definePluginStyles } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned global CSS + its style-service install id, shaped
 * by {@link definePluginStyles} into the `STYLES` / `STYLE_ID` exports the
 * activation installs. Class names are namespaced `tri-pdf-*` since these rules
 * are not Svelte-scoped. The panel markup and look are carried over from core's
 * former `PdfExportPanel.svelte`, rendered here as a self-positioned
 * toggle-plus-panel (the SDK mount seam owns no docked-panel chrome).
 */
export const { STYLES, STYLE_ID } = definePluginStyles(
    `
.tri-pdf {
    position: absolute;
    left: var(--ui-inset, 0.5rem);
    bottom: var(--ui-inset, 0.5rem);
    z-index: 40;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    pointer-events: none;
    color: var(--tri-toolbar-content, currentColor);
}
.tri-pdf > * {
    pointer-events: auto;
}

.tri-pdf-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-hit, 2.25rem);
    height: var(--ui-hit, 2.25rem);
    padding: 0;
    border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.15));
    border-radius: var(--tri-radius-buttons, 0.5rem);
    background-color: var(--tri-toolbar-bg, rgb(255 255 255 / 0.9));
    color: inherit;
    cursor: pointer;
    box-shadow: var(--ui-chrome-shadow, 0 4px 6px -4px rgb(0 0 0 / 0.2));
}
.tri-pdf-toggle:hover {
    background-color: color-mix(in oklab, var(--tri-toolbar-bg, #fff) 80%, transparent);
}
.tri-pdf-toggle[aria-expanded='true'] {
    background-color: var(--tri-color-primary, #2563eb);
    color: var(--tri-color-primary-content, #fff);
    border-color: transparent;
}
.tri-pdf-toggle svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: currentColor;
}

.tri-pdf-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 20rem;
    max-width: min(20rem, 80vw);
    max-height: 70vh;
    overflow-y: auto;
    padding: 1rem;
    border-radius: var(--tri-radius-panels, 0.75rem);
    border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.15));
    background-color: var(--tri-panel-surface, var(--panel-surface, rgb(255 255 255 / 0.98)));
    color: var(--panel-fg, inherit);
    box-shadow: var(
        --ui-chrome-shadow,
        0 20px 25px -5px rgb(0 0 0 / 0.15),
        0 8px 10px -6px rgb(0 0 0 / 0.15)
    );
}

.tri-pdf-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
}
.tri-pdf-title svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: currentColor;
}

.tri-pdf-description {
    margin: 0;
    font-size: 0.875rem;
    color: color-mix(in oklab, var(--panel-fg, currentColor) 70%, transparent);
}

.tri-pdf-field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}
.tri-pdf-label {
    font-size: 0.8125rem;
    color: color-mix(in oklab, currentColor 60%, transparent);
}
.tri-pdf-select {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border-radius: var(--tri-radius-buttons, 0.5rem);
    border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.2));
    background-color: var(--tri-input-bg, #fff);
    color: inherit;
    font: inherit;
}

.tri-pdf-card {
    border-radius: var(--tri-radius-panels, 0.5rem);
    background-color: var(--tri-input-bg, rgb(0 0 0 / 0.03));
    border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.12));
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.875rem;
}
.tri-pdf-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.tri-pdf-summary-count {
    font-weight: 600;
}

.tri-pdf-alert {
    border-radius: var(--tri-radius-panels, 0.5rem);
    border: 1px solid color-mix(in oklab, var(--alert-color, currentColor) 20%, transparent);
    background: color-mix(in oklab, var(--alert-color, currentColor) 8%, var(--tri-input-bg, transparent));
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
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

.tri-pdf-actions {
    display: flex;
}
.tri-pdf-export {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    border-radius: var(--tri-radius-buttons, 0.5rem);
    background-color: var(--tri-color-primary, #2563eb);
    color: var(--tri-color-primary-content, #fff);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
}
.tri-pdf-export svg {
    width: 1.125rem;
    height: 1.125rem;
    fill: currentColor;
}
.tri-pdf-export:disabled {
    opacity: 0.5;
    cursor: default;
}
`,
    'panel',
);
