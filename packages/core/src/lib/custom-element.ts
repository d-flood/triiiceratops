// Self-contained IIFE entry: registers <triiiceratops-viewer> and bootstraps
// window.Triiiceratops (same-realm plugin exchange + curated shared Svelte runtime).
// Third-party plugins bundle their own runtime — sharing private svelte/internal is only safe across same-release packages.

import TriiiceratopsViewerElement from './components/TriiiceratopsViewerElement.svelte';
import { installBrowserRuntime, VIEWER_ELEMENT_TAG } from './browser-runtime';
import { CORE_VERSION, pluginApiVersion, capabilities } from './plugin/api';
import { SHARED_CORE_UTILS } from './shared-core-utils';
import { SHARED_SVELTE_RUNTIME } from './shared-svelte-runtime';

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
    svelteRuntime: SHARED_SVELTE_RUNTIME,
    coreUtils: SHARED_CORE_UTILS,
});
