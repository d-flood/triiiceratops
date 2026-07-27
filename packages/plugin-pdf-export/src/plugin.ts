/**
 * The PDF-export plugin, authored entirely on `@triiiceratops/plugin-sdk`.
 *
 * `definePlugin` returns the framework-neutral factory core activates through the
 * structural seam (it carries its own `activate(host)`); core never imports this
 * package, its Svelte runtime, or its `pdf-lib` dependency. The UI is Svelte,
 * mounted through the neutral `view.mount(container, context)` contract and torn
 * down by the returned cleanup. Styles install through the SDK style service
 * (root-aware), strings resolve through the per-viewer locale service over this
 * package's catalog, and the toolbar glyph is a `svgIcon` descriptor.
 *
 * The factory-with-config authoring API is preserved: `createPdfExportPlugin(config)`
 * stays the public entry (a consumer can supply a cover sheet, filename provider,
 * OCR overlay provider, custom image loader, etc.), adapted to `definePlugin`
 * internally. The consumer `config` is captured in the `view.mount` closure and
 * handed to the panel through Svelte's context map, so each activation renders
 * with its own configuration. A preconfigured default (`PdfExportPlugin`) is
 * exported alongside it.
 *
 * The plugin reads the raw OSD viewer (`ViewerState.osdViewer`) to size export
 * requests, so it declares `requiredCapabilities: ['osd@5']`.
 */

import { mount, unmount } from 'svelte';

import {
    definePlugin,
    type PluginView,
    type SdkPlugin,
} from '@triiiceratops/plugin-sdk';

// The Svelte-scoped CSS of every bundled component (this plugin's own + the
// `@triiiceratops/ui` primitives it renders), extracted at build time by
// `bundledCss()` (see vite.config.ts). Installed through the root-aware,
// nonce-aware SDK style service so idiomatic `<style>` blocks stay CSP-safe.
import BUNDLED_CSS from 'virtual:tri-bundled-css';

import { catalog } from './catalog';
import { PLUGIN_CONTEXT_KEY, type PanelContext } from './contextKey';
import { FILE_PDF_ICON } from './icons';
import Panel from './Panel.svelte';
import { STYLE_ID, STYLES } from './styles';
import type { PdfExportConfig } from './types';

const NAME = '@triiiceratops/plugin-pdf-export';
const VERSION = '1.0.0-rc.0';

function createView(config: PdfExportConfig): PluginView {
    return {
        mount(container, context) {
            // Package-owned global layout CSS (namespaced, not Svelte-scoped)…
            const releaseStyles = context.styles.install(STYLES, STYLE_ID);
            // …plus the build-extracted Svelte-scoped component CSS (this
            // plugin's + the `@triiiceratops/ui` primitives). Separate install id
            // so the style service refcounts each independently.
            const releaseBundled = context.styles.install(
                BUNDLED_CSS,
                'bundled',
            );
            // Hand the (stable) activation context + consumer config to the panel
            // through Svelte's component-context map. `getContext` returns them as
            // a plain, non-reactive value — correct, since a fresh mount gets a
            // fresh context.
            const app = mount(Panel, {
                target: container,
                context: new Map<symbol, PanelContext>([
                    [PLUGIN_CONTEXT_KEY, { context, config }],
                ]),
            });
            return () => {
                unmount(app);
                releaseBundled();
                releaseStyles();
            };
        },
    };
}

/**
 * Create a PDF-export plugin factory with consumer configuration. Activate the
 * returned factory explicitly, per viewer.
 */
export function createPdfExportPlugin(config: PdfExportConfig = {}): SdkPlugin {
    return definePlugin({
        name: NAME,
        version: VERSION,
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        requiredCapabilities: ['osd@5'],
        icon: FILE_PDF_ICON,
        target: 'panel',
        // TRANSITIONAL routing marker (epic restore-plugin-toolbar-chrome,
        // ticket 05). Opts this plugin onto the core-owned-chrome path added in
        // ticket 02: core renders the toolbar button from `icon`/`target`, docks
        // the panel container in the viewer chrome, and owns open/close. The
        // plugin renders only content into the core-provided container. This flag
        // is removed in ticket 07 once core-chrome is the only path.
        __coreChrome: true,
        catalog,
        view: createView(config),
    });
}

/** A preconfigured PDF-export plugin (no consumer config). */
export const PdfExportPlugin: SdkPlugin = createPdfExportPlugin();
