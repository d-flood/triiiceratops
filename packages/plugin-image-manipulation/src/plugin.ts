/**
 * The image-manipulation plugin, authored entirely on `@triiiceratops/plugin-sdk`.
 *
 * `definePlugin` returns the framework-neutral factory core activates through the
 * structural seam (it carries its own `activate(host)`); core never imports this
 * package or its Svelte runtime. The UI is Svelte, mounted through the neutral
 * `view.mount(container, context)` contract and torn down by the returned
 * cleanup. Styles install through the SDK style service (root-aware), strings
 * resolve through the per-viewer locale service over this package's catalog, and
 * the toolbar glyph is a `svgIcon` descriptor. Filters touch the raw OSD viewer,
 * so the plugin declares `requiredCapabilities: ['osd@5']`.
 */

import { mount, unmount } from 'svelte';

import { definePlugin, type PluginView, type SdkPlugin } from '@triiiceratops/plugin-sdk';

import { catalog } from './catalog';
import { PLUGIN_CONTEXT_KEY, type FlyoutContext } from './contextKey';
import Flyout from './Flyout.svelte';
import { SLIDERS_ICON } from './icons';
import { STYLE_ID, STYLES } from './styles';

const view: PluginView = {
    mount(container, context) {
        const releaseStyles = context.styles.install(STYLES, STYLE_ID);
        // Own an abort controller for the OSD-readiness wait here, so the wait is
        // cancelled synchronously by the view cleanup (which `runActivation` runs
        // on deactivation) — not on the component's async `onDestroy`. This
        // guarantees the SDK helper's subscription is dropped on deactivation.
        const teardown = new AbortController();
        // Hand the (stable) activation context + teardown signal to the flyout
        // through Svelte's component-context map. `getContext` returns them as a
        // plain, non-reactive value — correct, since a fresh mount gets a fresh
        // context.
        const app = mount(Flyout, {
            target: container,
            context: new Map<symbol, FlyoutContext>([
                [PLUGIN_CONTEXT_KEY, { context, signal: teardown.signal }],
            ]),
        });
        return () => {
            teardown.abort();
            unmount(app);
            releaseStyles();
        };
    },
};

/** The image-manipulation plugin factory. Activate it explicitly, per viewer. */
export const ImageManipulationPlugin: SdkPlugin = definePlugin({
    name: '@triiiceratops/plugin-image-manipulation',
    version: '1.0.0-rc.0',
    coreRange: '>=1.0.0-rc.0',
    pluginApiRange: '^1.0.0',
    requiredCapabilities: ['osd@5'],
    icon: SLIDERS_ICON,
    target: 'flyout',
    catalog,
    view,
});
