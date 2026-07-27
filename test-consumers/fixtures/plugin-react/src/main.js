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
} from 'triiiceratops';
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
});

window.__tri = {
    cleanupRan: false,
    toggle: () => state.toggleToolbar(),
    unmount: () => {
        activation.deactivate();
        state.destroy();
    },
};
