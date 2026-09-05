/**
 * Self-contained browser registration into the `window.Triiiceratops` namespace
 * (SPEC.md "Plugin SDK And Browser API").
 *
 * The namespace is an order-independent registry: every core OR plugin IIFE
 * bootstraps it if absent (`window.Triiiceratops ??= …`), so a plugin script may
 * load and register before core. This helper mirrors core's registry shape
 * exactly (register / get / has / list, keyed by name with version as the
 * first-wins tiebreaker); when core loads it reuses whichever runtime object
 * already exists and fills in `coreVersion` / `pluginApiVersion` /
 * `capabilities`. Registration NEVER activates anything (CONTEXT.md
 * **Registration**) — activation stays explicit and per viewer.
 *
 * Shipped as the `@triiiceratops/plugin-sdk/register` subpath and consumed by
 * every plugin's IIFE entry. It imports only types (erased at build) and
 * nothing else from the SDK, so bundling it into a plugin IIFE pulls no runtime
 * and no Svelte into the bundle — the copy stays cheap and self-contained.
 *
 * A plugin that CANNOT load before core — one whose bundle reads core's shared
 * Svelte runtime off the namespace — has nothing to bootstrap and uses
 * `@triiiceratops/plugin-sdk/register-shared` instead, which is this file
 * without the registry.
 */

import type { SdkPlugin } from 'triiiceratops';

import type { PluginFactoryRegistry } from './browserNamespace.js';

function createRegistry(): PluginFactoryRegistry {
    const byName = new Map<string, SdkPlugin>();
    return {
        register(factory: SdkPlugin): void {
            const existing = byName.get(factory.name);
            if (!existing) {
                byName.set(factory.name, factory);
                return;
            }
            if (existing.version === factory.version) return;
            // triiiceratops-console-allow: page-level duplicate-registration
            // notice. There is no viewer/config (and so no structured channel)
            // at page-registration time; a one-time warn is the only signal.
            // Recorded in lint-allowlist.md.
            console.warn(
                `[triiiceratops] Ignoring plugin "${factory.name}" version ` +
                    `${factory.version}: version ${existing.version} is already ` +
                    `registered on this page and wins (first registration wins).`,
            );
        },
        get(name: string): SdkPlugin | undefined {
            return byName.get(name);
        },
        has(name: string): boolean {
            return byName.has(name);
        },
        list(): readonly SdkPlugin[] {
            return [...byName.values()];
        },
    };
}

/** Bootstrap `window.Triiiceratops` if absent and register the plugin factory. */
export function registerBrowserPlugin(plugin: SdkPlugin): void {
    const runtime = (window.Triiiceratops ??= {
        coreVersion: '',
        pluginApiVersion: '',
        capabilities: [],
        plugins: createRegistry(),
    });
    runtime.plugins.register(plugin);
}
