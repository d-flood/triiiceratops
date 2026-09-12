/**
 * Browser registration for a plugin that cannot load before core.
 *
 * `@triiiceratops/plugin-sdk/register` bootstraps `window.Triiiceratops` if it
 * is absent, so a plugin script may register before core's script runs. A plugin
 * whose bundle reads core's shared Svelte runtime off that namespace has no such
 * freedom: its own load-order gate refuses to evaluate the bundle at all without
 * a core already on the page, and any core that installs the namespace installs
 * `plugins` with it. Bootstrapping a registry it can never be the first to need
 * is dead weight in every one of its bytes, so this entry registers into the
 * namespace core installed and does nothing else.
 *
 * The `?.` is not a load-order fallback — the gate has already guaranteed the
 * namespace — but the honest way to say that this entry never creates one.
 */

import type { SdkPlugin } from 'triiiceratops';

import type { BrowserRuntime } from './browserNamespace.js';

/** Register the plugin factory into the core-installed namespace. */
export function registerBrowserPlugin(plugin: SdkPlugin): void {
    const runtime: BrowserRuntime | undefined = window.Triiiceratops;
    runtime?.plugins.register(plugin);
}
