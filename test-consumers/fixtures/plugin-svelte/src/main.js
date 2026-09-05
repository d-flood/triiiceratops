// Svelte SDK-adapter packed consumer (the tracer-pattern fixture).
//
// Consumes ONLY packed tarballs: `triiiceratops` (a live ViewerState + core's
// declared compatibility surface) and `@triiiceratops/plugin-sdk` (base +
// `/svelte` adapter). A Svelte 5 plugin mounts through the SDK mount contract,
// selects state via the `viewerSelector` store, reacts to a command, and
// unmounts cleanly on deactivation.

import { mount, unmount } from 'svelte';
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
import PluginUI from './PluginUI.svelte';

const ICON = svgIcon('<svg viewBox="0 0 1 1"></svg>');

const plugin = definePlugin({
    name: '@triiiceratops/plugin-svelte-fixture',
    version: '1.0.0',
    coreRange: '>=1.0.0-rc.0',
    pluginApiRange: '^1.0.0',
    requiredCapabilities: [],
    icon: ICON,
    target: 'panel',
    view: {
        mount(container, context) {
            const app = mount(PluginUI, {
                target: container,
                props: { context },
            });
            return () => {
                unmount(app);
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
