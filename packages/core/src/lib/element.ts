// Standards-based ESM entry for the Web Component (for bundler users).
//
// Importing this module for its side effects registers the
// <triiiceratops-viewer> custom element and bootstraps the window.Triiiceratops
// browser runtime namespace — identical tag, properties, methods, events,
// styles, and content-state behavior as the self-contained IIFE entry
// (custom-element.ts). Bundler consumers resolve dependencies through their own
// graph and register plugins through window.Triiiceratops.plugins.
//
//   import 'triiiceratops/element/register';

import TriiiceratopsViewerElement from './components/TriiiceratopsViewerElement.svelte';
import { installBrowserRuntime, VIEWER_ELEMENT_TAG } from './browser-runtime';
import { CORE_VERSION, pluginApiVersion, capabilities } from './plugin/api';
import { SHARED_SVELTE_RUNTIME } from './shared-svelte-runtime';

// The custom-element class the Svelte compiler produced for the wrapper. With no
// `tag` in <svelte:options>, importing the component does not auto-register it;
// the browser runtime owns idempotent, first-wins, version-aware registration.
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
});

export {};
