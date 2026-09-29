// Standards-based ESM entry: importing for side effects registers the
// <triiiceratops-viewer> custom element and bootstraps the browser runtime.

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

export {};
