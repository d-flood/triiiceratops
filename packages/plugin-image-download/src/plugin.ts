/**
 * The image-download plugin, authored entirely on `@triiiceratops/plugin-sdk`.
 *
 * `definePlugin` returns the framework-neutral factory core activates through the
 * structural seam (it carries its own `activate(host)`); core never imports this
 * package or its Svelte runtime. The UI is Svelte, mounted through the neutral
 * `view.mount(container, context)` contract and torn down by the returned
 * cleanup. Styles install through the SDK style service (root-aware), strings
 * resolve through the per-viewer locale service over this package's catalog, and
 * the toolbar glyph is a `svgIcon` descriptor. Export reads canvas geometry from
 * the raw OSD-backed viewer model, so the plugin declares
 * `requiredCapabilities: ['osd@5']`.
 *
 * This plugin's validation duty (SPEC.md Plugin Migration) is asynchronous
 * operations and binary output: the panel runs async IIIF fetch/compositing and
 * produces a download-ready `Blob` through the SDK seam.
 */

import { mount, unmount } from 'svelte';

import {
    definePlugin,
    type PluginView,
    type SdkPlugin,
} from '@triiiceratops/plugin-sdk';

// Build-extracted, Svelte-scoped CSS of every bundled component (this plugin's +
// the `@triiiceratops/ui` primitives), installed through the nonce-aware SDK
// style service so idiomatic `<style>` blocks stay CSP-safe. See vite.config.ts.
import BUNDLED_CSS from 'virtual:tri-bundled-css';

import { catalog } from './catalog';
import { PLUGIN_CONTEXT_KEY, type PanelContext } from './contextKey';
import { DOWNLOAD_ICON } from './icons';
import Panel from './Panel.svelte';
import { STYLE_ID, STYLES } from './styles';

const view: PluginView = {
    mount(container, context) {
        const releaseStyles = context.styles.install(STYLES, STYLE_ID);
        const releaseBundled = context.styles.install(BUNDLED_CSS, 'bundled');
        // Hand the (stable) activation context to the panel through Svelte's
        // component-context map. `getContext` returns it as a plain,
        // non-reactive value — correct, since a fresh mount gets a fresh context.
        const app = mount(Panel, {
            target: container,
            context: new Map<symbol, PanelContext>([
                [PLUGIN_CONTEXT_KEY, { context }],
            ]),
        });
        return () => {
            unmount(app);
            releaseBundled();
            releaseStyles();
        };
    },
};

/** The image-download plugin factory. Activate it explicitly, per viewer. */
export const ImageDownloadPlugin: SdkPlugin = definePlugin({
    name: '@triiiceratops/plugin-image-download',
    version: '1.0.0-rc.0',
    coreRange: '>=1.0.0-rc.0',
    pluginApiRange: '^1.0.0',
    requiredCapabilities: ['osd@5'],
    icon: DOWNLOAD_ICON,
    target: 'panel',
    catalog,
    view,
});
