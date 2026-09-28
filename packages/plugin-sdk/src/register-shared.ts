import type { SdkPlugin } from 'triiiceratops';

import type { BrowserRuntime } from './browserNamespace.js';

export function registerBrowserPlugin(plugin: SdkPlugin): void {
    const runtime: BrowserRuntime | undefined = window.Triiiceratops;
    runtime?.plugins.register(plugin);
}
