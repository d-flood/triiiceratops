// A tiny framework-free plugin under test, authored with the packed SDK's
// `definePlugin` + `svgIcon`. It selects `toolbarOpen`, renders its value,
// installs a stylesheet, and tears everything down in its cleanup — exactly the
// lifecycle the conformance suite checks.
import { definePlugin, svgIcon } from '@triiiceratops/plugin-sdk';

const ICON = svgIcon('<svg viewBox="0 0 1 1"><path d="M0 0h1v1H0z" /></svg>');

export function createDemoPlugin() {
    return definePlugin({
        name: '@example/vitest-kit-demo',
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        icon: ICON,
        target: 'panel',
        catalog: { en: { title: 'Demo' }, de: { title: 'Demo (de)' } },
        view: {
            mount(container, context) {
                const uninstall = context.styles.install(
                    '.vitest-kit-demo{}',
                    'root',
                );
                const selector = context.selectors.select((s) => s.toolbarOpen);
                const label = document.createElement('span');
                label.dataset.testid = 'state';
                label.textContent = selector.get() ? 'open' : 'closed';
                const stop = selector.subscribe((open) => {
                    label.textContent = open ? 'open' : 'closed';
                });
                container.appendChild(label);
                return () => {
                    stop();
                    uninstall();
                    label.remove();
                };
            },
        },
    });
}
