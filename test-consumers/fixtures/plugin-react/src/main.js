// React SDK-adapter packed consumer.
//
// Consumes ONLY packed tarballs: `triiiceratops` (a live ViewerState + core's
// declared compatibility surface) and `@triiiceratops/plugin-sdk` (base +
// `/react` adapter). A React plugin mounts through the SDK mount contract,
// selects state via `useViewerSelector`, reacts to a command, and unmounts
// cleanly on deactivation.

import {
    ViewerState,
    CORE_VERSION,
    pluginApiVersion,
    capabilities,
} from 'triiiceratops/svelte';
import {
    definePlugin,
    activatePlugin,
    svgIcon,
} from '@triiiceratops/plugin-sdk';
import { useViewerSelector } from '@triiiceratops/plugin-sdk/react';
import { StrictMode, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';

const ICON = svgIcon('<svg viewBox="0 0 1 1"></svg>');

function PluginUI({ context }) {
    const open = useViewerSelector(context, (s) => s.toolbarOpen);
    return h(
        'span',
        { 'data-testid': 'tri-plugin-value' },
        open ? 'open' : 'closed',
    );
}

const plugin = definePlugin({
    name: '@triiiceratops/plugin-react-fixture',
    version: '1.0.0',
    coreRange: '>=1.0.0-rc.0',
    pluginApiRange: '^1.0.0',
    requiredCapabilities: [],
    icon: ICON,
    target: 'panel',
    view: {
        mount(container, context) {
            const root = createRoot(container);
            root.render(h(StrictMode, null, h(PluginUI, { context })));
            return () => {
                root.unmount();
                window.__tri.cleanupRan = true;
            };
        },
    },
});

const state = new ViewerState();
const activation = activatePlugin(plugin, {
    container: document.getElementById('host'),
    viewerState: state,
    coreVersion: CORE_VERSION,
    pluginApiVersion,
    capabilities,
    // Activating outside `TriiiceratopsViewer` means owning the plugin's
    // services. Inert ones are enough here: what this fixture asserts is the
    // mount / selector / cleanup contract, not the services.
    styles: { install: () => () => {} },
    locale: { current: 'en', t: (key) => key, subscribe: () => () => {} },
    ui: { renderIcon: () => () => {} },
    surface: {
        id: 'fixture',
        isOpen: true,
        target: 'panel',
        open: () => {},
        close: () => {},
        toggle: () => {},
    },
    // Rethrow: this fixture activates a plugin expected to succeed, so a
    // guarded phase failure must surface as an uncaught page error rather than
    // be swallowed — the shared spec asserts no page errors were raised.
    reportError: (report) => {
        throw report.error;
    },
});

window.__tri = {
    cleanupRan: false,
    toggle: () => state.toggleToolbar(),
    unmount: () => {
        activation.deactivate();
        state.destroy();
    },
};
