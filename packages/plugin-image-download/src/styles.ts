import { definePluginStyles } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned global CSS + its style-service install id, shaped
 * by {@link definePluginStyles} into the `STYLES` / `STYLE_ID` exports the
 * activation installs. Class names are namespaced `tri-id-*` since these rules
 * are not Svelte-scoped.
 */
export const { STYLES, STYLE_ID } = definePluginStyles(
    `
.tri-id {
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
.tri-id > * {
    pointer-events: auto;
}

.tri-id-toggle {
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
.tri-id-toggle:hover {
    background-color: color-mix(in oklab, var(--tri-toolbar-bg, #fff) 80%, transparent);
}
.tri-id-toggle[aria-expanded='true'] {
    background-color: var(--tri-color-primary, #2563eb);
    color: var(--tri-color-primary-content, #fff);
    border-color: transparent;
}
.tri-id-toggle svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: currentColor;
}

.tri-id-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 18rem;
    max-width: min(18rem, 80vw);
    padding: 0.75rem;
    border-radius: var(--tri-radius-toolbar, 0.75rem);
    border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.15));
    background-color: var(--tri-toolbar-bg, rgb(255 255 255 / 0.97));
    box-shadow: var(
        --ui-chrome-shadow,
        0 10px 15px -3px rgb(0 0 0 / 0.15),
        0 4px 6px -4px rgb(0 0 0 / 0.15)
    );
}

.tri-id-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
    font-weight: 600;
}
.tri-id-header svg {
    width: 1.125rem;
    height: 1.125rem;
    fill: currentColor;
}

.tri-id-desc {
    font-size: 0.8125rem;
    opacity: 0.75;
    margin: 0;
}

.tri-id-fields {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
}
.tri-id-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}
.tri-id-label {
    font-size: 0.75rem;
    opacity: 0.7;
}
.tri-id-select {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border-radius: var(--tri-radius-buttons, 0.5rem);
    border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.2));
    background-color: var(--tri-input-bg, #fff);
    color: inherit;
    font: inherit;
    font-size: 0.8125rem;
}

.tri-id-alert {
    font-size: 0.8125rem;
    border-radius: var(--tri-radius-buttons, 0.5rem);
    border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.15));
    background-color: color-mix(in oklab, currentColor 6%, transparent);
    padding: 0.5rem 0.625rem;
}
.tri-id-alert.is-success {
    color: var(--tri-color-success-content, currentColor);
    background-color: color-mix(
        in oklab,
        var(--tri-color-success, #16a34a) 12%,
        transparent
    );
}
.tri-id-alert.is-error {
    color: var(--tri-color-error-content, currentColor);
    background-color: color-mix(
        in oklab,
        var(--tri-color-error, #dc2626) 12%,
        transparent
    );
}

.tri-id-download {
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
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
}
.tri-id-download svg {
    width: 1.125rem;
    height: 1.125rem;
    fill: currentColor;
}
.tri-id-download:hover:not(:disabled) {
    background-color: color-mix(in oklab, var(--tri-color-primary, #2563eb) 88%, black);
}
.tri-id-download:disabled {
    opacity: 0.5;
    cursor: default;
}
`,
    'panel',
);
