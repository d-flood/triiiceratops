/**
 * The plugin's global CSS, installed through the SDK style service
 * (`context.styles.install`) so it is root-aware: it reaches the document head
 * for a light-DOM viewer and the shadow root for the Web Component (SPEC.md —
 * "Global plugin CSS is installed through a root-aware style service"). Class
 * names are namespaced `tri-im-*` since these rules are not Svelte-scoped.
 *
 * Styling inherits the core public token contract (`--tri-*`) because the
 * plugin's DOM lives inside the viewer root; only plugin-specific rules live
 * here (SPEC.md — "Plugin panel styling continues to inherit the core public
 * token contract while plugin-specific styles remain package-owned").
 */
export const STYLES = `
.tri-im {
    position: absolute;
    right: var(--ui-inset, 0.5rem);
    bottom: var(--ui-inset, 0.5rem);
    z-index: 40;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
    pointer-events: none;
    color: var(--tri-toolbar-content, currentColor);
}
.tri-im > * {
    pointer-events: auto;
}

.tri-im-toggle {
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
.tri-im-toggle:hover {
    background-color: color-mix(in oklab, var(--tri-toolbar-bg, #fff) 80%, transparent);
}
.tri-im-toggle[aria-expanded='true'] {
    background-color: var(--tri-color-primary, #2563eb);
    color: var(--tri-color-primary-content, #fff);
    border-color: transparent;
}
.tri-im-toggle svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: currentColor;
}

.tri-im-flyout {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: var(--tri-radius-toolbar, 0.75rem);
    border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.15));
    background-color: var(--tri-toolbar-bg, rgb(255 255 255 / 0.95));
    box-shadow: var(
        --ui-chrome-shadow,
        0 10px 15px -3px rgb(0 0 0 / 0.15),
        0 4px 6px -4px rgb(0 0 0 / 0.15)
    );
}

.tri-im-sliders {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.tri-im-row {
    display: grid;
    grid-template-columns: 1.25rem 1fr 2.75rem;
    align-items: center;
    gap: 0.5rem;
}
.tri-im-row svg {
    width: 1.125rem;
    height: 1.125rem;
    fill: currentColor;
    opacity: 0.85;
}
.tri-im-row input[type='range'] {
    width: 100%;
    accent-color: var(--tri-color-primary, #2563eb);
}
.tri-im-val {
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
    opacity: 0.85;
}

.tri-im-actions {
    display: flex;
    gap: 0.25rem;
    justify-content: flex-end;
    border-top: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.12));
    padding-top: 0.5rem;
}
.tri-im-act {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-hit, 2rem);
    height: var(--ui-hit, 2rem);
    padding: 0;
    border: none;
    border-radius: var(--tri-radius-buttons, 0.5rem);
    background: transparent;
    color: inherit;
    cursor: pointer;
}
.tri-im-act:hover {
    background-color: color-mix(in oklab, currentColor 12%, transparent);
}
.tri-im-act[aria-pressed='true'] {
    background-color: var(--tri-color-primary, #2563eb);
    color: var(--tri-color-primary-content, #fff);
}
.tri-im-act:disabled {
    opacity: 0.4;
    cursor: default;
}
.tri-im-act:disabled:hover {
    background: transparent;
}
.tri-im-act svg {
    width: 1.125rem;
    height: 1.125rem;
    fill: currentColor;
}
`;

/** Stable style-service install id (keyed `<pluginName>:<id>` by the service). */
export const STYLE_ID = 'flyout';
