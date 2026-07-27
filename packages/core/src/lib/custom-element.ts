// Self-contained IIFE entry for the Web Component.
// Loading this bundle registers the <triiiceratops-viewer> custom element and
// bootstraps the window.Triiiceratops browser runtime namespace.

// Expose Svelte internals for LEGACY IIFE plugin builds (ticket 20 deletes this
// once every legacy plugin IIFE has migrated). Legacy plugins built as IIFE
// share the same Svelte runtime instance so getContext/setContext work across
// bundle boundaries. New-style plugins do NOT need this — they register through
// window.Triiiceratops.plugins and exchange live objects in the same realm.
// @ts-expect-error - svelte/internal/client is not typed but exists at runtime
// eslint-disable-next-line svelte/no-svelte-internal
import * as svelteInternal from 'svelte/internal/client';
import * as svelte from 'svelte';
import * as svelteReactivity from 'svelte/reactivity';

import TriiiceratopsViewerElement from './components/TriiiceratopsViewerElement.svelte';
import { installBrowserRuntime, VIEWER_ELEMENT_TAG } from './browser-runtime';
import { CORE_VERSION, pluginApiVersion, capabilities } from './plugin/api';

declare global {
    interface Window {
        __TriiiceratopsSvelteRuntime: {
            svelte: typeof svelte;
            internal: unknown;
            reactivity: typeof svelteReactivity;
        };
        TriiiceratopsPlugins?: Record<string, unknown>;
    }
}

// Legacy globals — kept in place until ticket 20 deletes their last consumer.
window.__TriiiceratopsSvelteRuntime = {
    svelte,
    internal: svelteInternal,
    reactivity: svelteReactivity,
};
window.TriiiceratopsPlugins = window.TriiiceratopsPlugins || {};

// The custom-element class the Svelte compiler produced for the wrapper. With no
// `tag` in <svelte:options>, importing the component does not auto-register it;
// the browser runtime owns registration so it is idempotent, first-wins, and
// version-aware.
const elementCtor = (
    TriiiceratopsViewerElement as unknown as {
        element: CustomElementConstructor;
    }
).element;

installBrowserRuntime({
    coreVersion: CORE_VERSION,
    pluginApiVersion,
    capabilities,
    elementCtor,
    tag: VIEWER_ELEMENT_TAG,
});
