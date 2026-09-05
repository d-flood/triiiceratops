/**
 * Minimal stub host services, for a test that wants an activation and nothing
 * else.
 *
 * A `PluginHost` supplies `styles`, `locale`, `ui`, and `surface`; core builds
 * the real, per-viewer, root-aware implementations, and the test kit's
 * `createTestViewerContext` hands back recording doubles worth asserting
 * against. These stubs are for the third case: a bare `runActivation` into a
 * container the caller placed, where the services are required by the contract
 * and irrelevant to the test.
 *
 * They live on the testing surface rather than in the SDK's base entry so no
 * plugin bundle carries a service implementation no reader can see.
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
 * Chrome-less surface stub — a bare `runActivation` against a container the
 * caller placed itself, with no toolbar button, panel, or flyout in play.
 *
 * `isOpen` is `true`, not `false`: the caller mounted the plugin into a container
 * of their own and there is no chrome that could hide it, so the honest answer is
 * "visible". A `false` stub would silently park every plugin that gates work on
 * `surface.isOpen` in its paused state and look like a broken plugin. `open`,
 * `close`, and `toggle` are no-ops — there is no chrome to move — and `isOpen`
 * therefore never changes, so a subscriber correctly never wakes. `setAvailable`
 * is a no-op for the same reason: there is no button to hide.
 */
export function createStubSurfaceService(uiId?: string): PluginSurface {
    return {
        id: uiId ?? '',
        isOpen: true,
        target: 'panel',
        open: noop,
        close: noop,
        toggle: noop,
        setAvailable: noop,
    };
}
