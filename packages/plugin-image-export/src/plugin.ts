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
import { PLUGIN_META } from './identity';
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
    name: PLUGIN_META.name,
    title: 'image_download_title',
    uiId: 'image-download',
    version: PLUGIN_META.version,
    coreRange: '>=1.0.0-rc.0',
    pluginApiRange: '^1.0.0',
    requiredCapabilities: [],
    icon: DOWNLOAD_ICON,
    target: 'panel',
    catalog,
    view,
});
