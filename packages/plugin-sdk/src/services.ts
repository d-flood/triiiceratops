/**
 * Minimal stub service implementations (ticket 07).
 *
 * The plugin context always exposes `styles`, `locale`, and `ui`. When the host
 * omits them, the SDK fills these harmless stubs so a plugin can be authored and
 * activated end-to-end (e.g. bare `runActivation` with no host services). In
 * production core supplies the real, per-viewer, root-aware services (ticket 08)
 * on the {@link PluginHost}; the SDK only reaches for a stub as a fallback.
 */

import type {
    IconDescriptor,
    PluginLocaleService,
    PluginStyleService,
    PluginUiService,
} from 'triiiceratops';

const noop = (): void => {};

/** No-op style service: records nothing, returns a no-op uninstaller. */
export function createStubStyleService(): PluginStyleService {
    return {
        install(_css: string, _id: string): () => void {
            return noop;
        },
    };
}

/** English-only locale stub: returns the key, never changes locale. */
export function createStubLocaleService(): PluginLocaleService {
    return {
        current: 'en',
        t(key: string, _params?: Record<string, string | number>): string {
            return key;
        },
        subscribe(_callback: (locale: string) => void): () => void {
            return noop;
        },
    };
}

/** No-op UI service: renders nothing, returns a no-op cleanup. */
export function createStubUiService(): PluginUiService {
    return {
        renderIcon(_icon: IconDescriptor, _container: HTMLElement): () => void {
            return noop;
        },
    };
}
