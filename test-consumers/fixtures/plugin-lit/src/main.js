// Lit SDK-adapter packed consumer.
//
// Consumes ONLY packed tarballs: `triiiceratops` (a live ViewerState + core's
// declared compatibility surface) and `@triiiceratops/plugin-sdk` (base +
// `/lit` adapter). A Lit plugin mounts through the SDK mount contract, selects
// state via `SelectorController` (a ReactiveController), reacts to a command,
// and unmounts cleanly on deactivation.

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
import { SelectorController } from '@triiiceratops/plugin-sdk/lit';
import { LitElement, html } from 'lit';

const ICON = svgIcon('<svg viewBox="0 0 1 1"></svg>');

const TAG = 'tri-lit-fixture';

const plugin = definePlugin({
    name: '@triiiceratops/plugin-lit-fixture',
    version: '1.0.0',
    coreRange: '>=1.0.0-rc.0',
    pluginApiRange: '^1.0.0',
    requiredCapabilities: [],
    icon: ICON,
    target: 'panel',
    view: {
        mount(container, context) {
            if (!customElements.get(TAG)) {
                class PluginEl extends LitElement {
                    // Light DOM so the testid is directly queryable.
                    createRenderRoot() {
                        return this;
                    }
                    setContext(context) {
                        this.toolbar = new SelectorController(
                            this,
                            context.selectors.select((s) => s.toolbarOpen),
                        );
                    }
                    render() {
                        return html`<span data-testid="tri-plugin-value"
                            >${this.toolbar?.value ? 'open' : 'closed'}</span
                        >`;
                    }
                }
                customElements.define(TAG, PluginEl);
            }
            const el = document.createElement(TAG);
            el.setContext(context);
            container.appendChild(el);
            return () => {
                el.remove();
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
