// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { definePlugin, svgIcon } from '@triiiceratops/plugin-sdk';

const icon = svgIcon('<svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z" /></svg>');

export function createExamplePlugin() {
    return definePlugin({
        name: '@example/my-plugin', // package-qualified, keys the registry
        title: 'example_title', // chrome label (tooltip + panel header):
        // resolved against `catalog` in the viewer's active locale, English
        // fallback, then rendered verbatim if no key matches — so a literal
        // like 'Example' works too. Omit it and the toolbar shows `name`.
        uiId: 'my-plugin', // stable, DOM-safe key for config.plugins[uiId]
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0', // core versions this plugin supports
        pluginApiRange: '^1.0.0', // plugin API versions supported
        requiredCapabilities: [], // e.g. ['osd@5']
        icon,
        target: 'panel', // default target; or 'flyout'. Host can override at
        // runtime via config.plugins[uiId].target / setPluginTarget.
        // There is no `position` field here — a panel's dock side is chosen
        // by the consuming app, not the plugin. See "Panel position" below.
        dismiss: 'light', // flyout dismiss: 'light' (default) or 'explicit'; ignored for panels
        catalog: { en: { example_title: 'Example' } }, // package-owned localization
        view: {
            mount(container, context) {
                const selector = context.selectors.select((s) => s.toolbarOpen);
                const label = document.createElement('span');
                label.textContent = selector.get() ? 'open' : 'closed';
                const stop = selector.subscribe((open) => {
                    label.textContent = open ? 'open' : 'closed';
                });
                container.appendChild(label);
                return () => {
                    stop();
                    label.remove();
                };
            },
        },
    });
}
