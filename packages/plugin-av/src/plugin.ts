/**
 * `@triiiceratops/plugin-av` — the audiovisual plugin, authored entirely on
 * `@triiiceratops/plugin-sdk`.
 *
 * `definePlugin` returns the framework-neutral factory core activates through
 * the structural seam (it carries its own `activate(host)`); core never imports
 * this package. The reader-facing surface is not this panel but the **stage**:
 * DOM in an overlay layer over each claimed canvas, built and placed by
 * `createAvStageManager`.
 *
 * `requiredCapabilities` names the seams this plugin cannot work without, so it
 * fails closed rather than half-working:
 *
 * - `canvas-claim` — without it the plugin would render over an
 *   unsupported-content placard it cannot suppress.
 * - `shared-svelte-runtime` — without it there is no `window.Triiiceratops`
 *   Svelte to consume, and this plugin's IIFE bundles none of its own.
 * - `shared-core-utils` — without it there are no curated core utilities on the
 *   namespace, and this plugin's IIFE bundles no copies of its own either.
 * - `transport-chrome` — without it there is nowhere to register the playback
 *   controls, and this plugin builds none of its own: a reader would get a
 *   staged recording with no way to play it.
 *
 * `coreRange` is pinned EXACTLY, not as a lower bound. `>=` would be satisfied
 * by a core 2.0 on a future Svelte, and `svelte/internal` is private API with no
 * semver guarantee: the capability says a runtime is shared, and only the exact
 * version says it is the same runtime. The pin must be re-stamped at every core
 * release — nothing in the release tooling does it, so it is a manual edit
 * alongside `CORE_VERSION`.
 */

import { mount, unmount } from 'svelte';

import {
    definePlugin,
    type PluginView,
    type SdkPlugin,
} from '@triiiceratops/plugin-sdk';

// The Svelte-scoped CSS of every bundled component, extracted at build time by
// `bundledCss()` (see vite.config.ts). Installed through the root-aware,
// nonce-aware SDK style service so idiomatic `<style>` blocks stay CSP-safe.
import BUNDLED_CSS from 'virtual:tri-bundled-css';

import { catalog } from './catalog';
import { PLUGIN_CONTEXT_KEY, type PanelContext } from './contextKey';
import { FILM_STRIP_ICON } from './icons';
import { PLUGIN_META } from './identity';
import Panel from './Panel.svelte';
import { createAvStageManager } from './stages.svelte';
import { STYLE_ID, STYLES } from './styles';

const { name: NAME, version: VERSION } = PLUGIN_META;

const view: PluginView = {
    mount(container, context) {
        // Package-owned global CSS for the stage (namespaced, not Svelte-scoped)…
        const releaseStyles = context.styles.install(STYLES, STYLE_ID);
        // …plus the build-extracted Svelte-scoped component CSS. Separate install
        // id so the style service refcounts each independently.
        const releaseBundled = context.styles.install(BUNDLED_CSS, 'bundled');

        // The stages exist whether or not the panel is open: the reader watches
        // the canvas, not this chrome. Building them builds DOM, so this is the
        // first thing here that can throw — and it throws before it has
        // registered a layer or claimed a canvas, leaving only the styles
        // installed above to unwind.
        let stages;
        try {
            stages = createAvStageManager(context, container);
        } catch (error) {
            releaseBundled();
            releaseStyles();
            throw error;
        }

        // External control (ADR 0018): hosts reach these commands through
        // `viewerState.getPluginState('av')`, and the panel below uses the very
        // same object, so the plugin's own UI cannot drift from the contract.
        context.publishState(stages.avState);

        let app;
        try {
            app = mount(Panel, {
                target: container,
                context: new Map<symbol, PanelContext>([
                    [PLUGIN_CONTEXT_KEY, { context, stages }],
                ]),
            });
        } catch (error) {
            // A throwing mount never returns the cleanup below, so nothing would
            // ever run `stages.destroy()`. The SDK and core release what they
            // track — styles, locale, the layer, the claims — but the manager's
            // `subscribeFrame` is a raw ViewerState subscription neither of them
            // knows about, and it holds every `<video>` for the viewer's
            // lifetime. Unwind it here and let the failure surface unchanged.
            stages.destroy();
            releaseBundled();
            releaseStyles();
            throw error;
        }

        return () => {
            void unmount(app);
            stages.destroy();
            releaseBundled();
            releaseStyles();
        };
    },
};

/** The audiovisual plugin. Activate it explicitly, per viewer. */
export const AvPlugin: SdkPlugin = definePlugin({
    name: NAME,
    title: 'av_title',
    uiId: PLUGIN_META.uiId,
    version: VERSION,
    coreRange: '1.0.0-rc.36',
    pluginApiRange: '^1.2.0',
    requiredCapabilities: [
        'canvas-claim',
        'shared-svelte-runtime',
        'shared-core-utils',
        'transport-chrome',
    ],
    icon: FILM_STRIP_ICON,
    target: 'panel',
    // Transcripts run long: core gives the panel the height its column has left
    // and scrolls it, instead of capping the list at some constant.
    fills: true,
    catalog,
    view,
});
