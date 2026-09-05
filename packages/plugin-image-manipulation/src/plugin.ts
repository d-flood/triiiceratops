/**
 * The image-manipulation plugin, authored entirely on `@triiiceratops/plugin-sdk`.
 *
 * `definePlugin` returns the framework-neutral factory core activates through the
 * structural seam (it carries its own `activate(host)`); core never imports this
 * package or its Svelte runtime. Chrome is core-owned: core renders the
 * toolbar button from `meta.icon`, owns the button's open/close state, and
 * anchors + auto-places the flyout toward the canvas. `view.mount(container,
 * context)` receives a
 * content-only element core has already placed, and this plugin renders ONLY the
 * flyout content into it — it draws no button and positions nothing.
 *
 * `dismiss: 'explicit'` keeps the Flyout open while adjusting (a canvas click
 * pans/zooms without dismissing the editing session).
 *
 * Filter state lives in the Activation-scoped {@link FilterController} created
 * here (per viewer, above the mounted component), so slider positions survive
 * close→reopen and the canvas-change / deactivation resets fire whether the
 * Flyout is open or closed. Filters are applied through the first-party
 * `setImageAdjustments` command, so the plugin needs no capability and no
 * readiness gate: the adjustment set lives in viewer state and is replayed onto
 * whichever renderer mounts.
 */

import { mount, unmount } from 'svelte';

import {
    definePlugin,
    type PluginView,
    type SdkPlugin,
} from '@triiiceratops/plugin-sdk';

// The Svelte-scoped CSS of every bundled component (this plugin's Flyout + the
// `@triiiceratops/ui` Range/Tooltip primitives it renders), extracted at build
// time by `bundledCss()` (see vite.config.ts). Installed through the root-aware,
// nonce-aware SDK style service so idiomatic `<style>` blocks stay CSP-safe.
import BUNDLED_CSS from 'virtual:tri-bundled-css';

import { catalog } from './catalog';
import { PLUGIN_CONTEXT_KEY, type FlyoutContext } from './contextKey';
import { createFilterController } from './filterController.svelte';
import Flyout from './Flyout.svelte';
import { SLIDERS_ICON } from './icons';
import { STYLE_ID, STYLES } from './styles';

const view: PluginView = {
    mount(container, context) {
        // Package-owned global CSS (the ancestor-keyed downward-flyout flip)…
        const releaseStyles = context.styles.install(STYLES, STYLE_ID);
        // …plus the build-extracted Svelte-scoped component CSS (this plugin's
        // Flyout + the `@triiiceratops/ui` primitives). Separate install id so
        // the style service refcounts each independently.
        const releaseBundled = context.styles.install(BUNDLED_CSS, 'bundled');
        // Activation-scoped filter state. Created ABOVE the mounted component
        // so the last slider positions survive close→reopen and the
        // canvas-change / deactivation resets take effect whether open or closed.
        const controller = createFilterController(context);
        // Hand the controller + locale to the flyout through Svelte's
        // component-context map. `getContext` returns them as plain, non-reactive
        // values — correct, since a fresh mount gets a fresh activation and the
        // controller's own `$state` carries the reactivity.
        const app = mount(Flyout, {
            target: container,
            context: new Map<symbol, FlyoutContext>([
                [PLUGIN_CONTEXT_KEY, { controller, locale: context.locale }],
            ]),
        });
        return () => {
            unmount(app);
            controller.dispose();
            releaseBundled();
            releaseStyles();
        };
    },
};

/** The image-manipulation plugin factory. Activate it explicitly, per viewer. */
export const ImageManipulationPlugin: SdkPlugin = definePlugin({
    name: '@triiiceratops/plugin-image-manipulation',
    title: 'image_adjustments_title',
    uiId: 'image-manipulation',
    version: '1.0.0-rc.0',
    coreRange: '>=1.0.0-rc.0',
    pluginApiRange: '^1.0.0',
    requiredCapabilities: [],
    icon: SLIDERS_ICON,
    target: 'flyout',
    // A live-editing surface: closes only via its toolbar button, never on a
    // canvas click (SPEC.md — Dismiss).
    dismiss: 'explicit',
    catalog,
    view,
});
