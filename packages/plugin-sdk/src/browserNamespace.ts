/**
 * The `window.Triiiceratops` shape the SDK's registration entries write to.
 *
 * Types only, so both registration subpaths can describe the same namespace
 * without either one pulling the other's runtime into a plugin bundle.
 */

import type { SdkPlugin } from 'triiiceratops';

export interface PluginFactoryRegistry {
    register(factory: SdkPlugin): void;
    get(name: string): SdkPlugin | undefined;
    has(name: string): boolean;
    list(): readonly SdkPlugin[];
}

export interface BrowserRuntime {
    coreVersion: string;
    pluginApiVersion: string;
    capabilities: readonly string[];
    plugins: PluginFactoryRegistry;
}

declare global {
    interface Window {
        Triiiceratops?: BrowserRuntime;
    }
}
