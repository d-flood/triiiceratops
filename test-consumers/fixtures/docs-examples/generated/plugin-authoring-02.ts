// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { definePlugin, svgIcon } from '@triiiceratops/plugin-sdk';

const icon = svgIcon('<svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z" /></svg>');

export function createExamplePlugin() {
    return definePlugin({
        name: '@example/my-plugin', // package-qualified, keys the registry
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0', // core versions this plugin supports
        pluginApiRange: '^1.0.0', // plugin API versions supported
        requiredCapabilities: [], // e.g. ['osd@5']
        icon,
        target: 'panel', // or 'flyout'
        catalog: { en: { title: 'Example' } }, // package-owned localization
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
