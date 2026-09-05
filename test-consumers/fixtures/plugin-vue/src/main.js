// Vue SDK-adapter packed consumer.
//
// Consumes ONLY packed tarballs: `triiiceratops` (a live ViewerState + core's
// declared compatibility surface) and `@triiiceratops/plugin-sdk` (base +
// `/vue` adapter). A Vue plugin mounts through the SDK mount contract, selects
// state via the `useViewerSelector` composable (a readonly ref), reacts to a
// command, and unmounts cleanly on deactivation.

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
import { useViewerSelector } from '@triiiceratops/plugin-sdk/vue';
import { createApp, defineComponent, h } from 'vue';

const ICON = svgIcon('<svg viewBox="0 0 1 1"></svg>');

const PluginUI = defineComponent({
    props: { context: { type: Object, required: true } },
    setup(props) {
        const open = useViewerSelector(props.context, (s) => s.toolbarOpen);
        return () =>
            h(
                'span',
                { 'data-testid': 'tri-plugin-value' },
                open.value ? 'open' : 'closed',
            );
    },
});

const plugin = definePlugin({
    name: '@triiiceratops/plugin-vue-fixture',
    version: '1.0.0',
    coreRange: '>=1.0.0-rc.0',
    pluginApiRange: '^1.0.0',
    requiredCapabilities: [],
    icon: ICON,
    target: 'panel',
    view: {
        mount(container, context) {
            const app = createApp(PluginUI, { context });
            app.mount(container);
            return () => {
                app.unmount();
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
