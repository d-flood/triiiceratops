// Entry point for custom element build
// Importing this module registers the <triiiceratops-viewer> custom element

// Expose Svelte internals for IIFE plugin builds
// Plugins built as IIFE need to share the same Svelte runtime instance
// so that getContext/setContext work correctly across bundle boundaries
// @ts-expect-error - svelte/internal/client is not typed but exists at runtime
// eslint-disable-next-line svelte/no-svelte-internal
import * as svelteInternal from 'svelte/internal/client';
import * as svelte from 'svelte';

declare global {
    interface Window {
        __TriiiceratopsSvelteRuntime: {
            svelte: typeof svelte;
            internal: unknown;
        };
        TriiiceratopsPlugins?: Record<string, unknown>;
    }
}

window.__TriiiceratopsSvelteRuntime = {
    svelte,
    internal: svelteInternal,
};

// Initialize the plugins namespace
window.TriiiceratopsPlugins = window.TriiiceratopsPlugins || {};

// Register the custom element
import './components/TriiiceratopsViewerElement.svelte';
