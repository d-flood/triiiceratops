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
