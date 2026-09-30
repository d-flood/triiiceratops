// Self-contained IIFE entry: registers <triiiceratops-viewer> and bootstraps
// window.Triiiceratops (same-realm plugin exchange + curated shared Svelte runtime).
// Third-party plugins bundle their own runtime — sharing private svelte/internal is only safe across same-release packages.

import { ViewerElement } from './components/viewerElement.svelte';
import { installBrowserRuntime, VIEWER_ELEMENT_TAG } from './browser-runtime';
import { CORE_VERSION, pluginApiVersion, capabilities } from './plugin/api';
import { SHARED_CORE_UTILS } from './shared-core-utils';
import { SHARED_SVELTE_RUNTIME } from './shared-svelte-runtime';

installBrowserRuntime({
    coreVersion: CORE_VERSION,
    pluginApiVersion,
    capabilities,
    elementCtor: ViewerElement,
    tag: VIEWER_ELEMENT_TAG,
    svelteRuntime: SHARED_SVELTE_RUNTIME,
    coreUtils: SHARED_CORE_UTILS,
});
