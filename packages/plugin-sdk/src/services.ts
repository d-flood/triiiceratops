/**
 * Minimal stub service implementations.
 *
 * The plugin context always exposes `styles`, `locale`, and `ui`. When the host
 * omits them, the SDK fills these harmless stubs so a plugin can be authored and
 * activated end-to-end (e.g. bare `runActivation` with no host services). In
 * production core supplies the real, per-viewer, root-aware services on the
 * {@link PluginHost}; the SDK only reaches for a stub as a fallback.
 */

import type {
    IconDescriptor,
    PluginLocaleService,
    PluginStyleService,
    PluginSurface,
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

/**
 * Chrome-less surface stub, used when a host supplies no `surface` — a bare
 * `runActivation` against a container the caller placed itself, with no toolbar
 * button, panel, or flyout in play.
 *
 * `isOpen` is `true`, not `false`: the caller mounted the plugin into a container
 * of their own and there is no chrome that could hide it, so the honest answer is
 * "visible". A `false` stub would silently park every plugin that gates work on
 * `surface.isOpen` in its paused state and look like a broken plugin. `open`,
 * `close`, and `toggle` are no-ops — there is no chrome to move — and `isOpen`
 * therefore never changes, so a subscriber correctly never wakes.
 */
export function createStubSurfaceService(uiId?: string): PluginSurface {
    return {
        id: uiId ?? '',
        isOpen: true,
        target: 'panel',
        open: noop,
        close: noop,
        toggle: noop,
    };
}
