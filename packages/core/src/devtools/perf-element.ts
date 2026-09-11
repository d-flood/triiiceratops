// Performance-only custom-element entry. This is built outside dist so the
// renderer counters used by the harness cannot enter the shipped package.
import TriiiceratopsViewerElement from '../lib/components/TriiiceratopsViewerElement.svelte';
import {
    installBrowserRuntime,
    VIEWER_ELEMENT_TAG,
} from '../lib/browser-runtime';
import {
    CORE_VERSION,
    capabilities,
    pluginApiVersion,
} from '../lib/plugin/api';
import { setRendererDevtools } from '../lib/renderer/rendererDevtools';
import { SHARED_CORE_UTILS } from '../lib/shared-core-utils';
import { SHARED_SVELTE_RUNTIME } from '../lib/shared-svelte-runtime';

import { installCanvasRendererHandle } from './canvasRendererHandle';

setRendererDevtools(installCanvasRendererHandle);

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
