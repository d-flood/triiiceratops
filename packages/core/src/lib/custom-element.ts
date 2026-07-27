// Self-contained IIFE entry for the Web Component.
// Loading this bundle registers the <triiiceratops-viewer> custom element and
// bootstraps the window.Triiiceratops browser runtime namespace. Plugins register
// their own factories through window.Triiiceratops.plugins and exchange live
// objects in the same realm — core shares no Svelte runtime with plugin IIFEs.

import TriiiceratopsViewerElement from './components/TriiiceratopsViewerElement.svelte';
import { installBrowserRuntime, VIEWER_ELEMENT_TAG } from './browser-runtime';
import { CORE_VERSION, pluginApiVersion, capabilities } from './plugin/api';

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
