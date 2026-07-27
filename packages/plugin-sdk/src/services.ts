/**
 * Minimal stub service implementations (ticket 07).
 *
 * The plugin context always exposes `styles`, `locale`, and `ui`. When the host
 * omits them (as core does in ticket 07), the SDK fills these harmless stubs so
 * a plugin can be authored and activated end-to-end. Ticket 08 replaces them
 * with real, per-viewer, root-aware services supplied by the host — the *types*
 * (owned by core) are already final, so that fill-in will not break ticket 07
 * consumers.
 */

import type {
    PluginIcon,
    PluginLocaleService,
    PluginStyleService,
    PluginUiService,
} from 'triiiceratops';

const noop = (): void => {};

/** No-op style service: records nothing, returns a no-op uninstaller. */
export function createStubStyleService(): PluginStyleService {
    return {
        inject(_id: string, _css: string): () => void {
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
        renderIcon(_icon: PluginIcon, _container: HTMLElement): () => void {
            return noop;
        },
    };
}
