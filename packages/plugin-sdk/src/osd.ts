/**
 * OSD-readiness helper (SPEC.md ViewerState contract — "The SDK provides a
 * helper to await OSD readiness").
 *
 * `osdViewer` is observable viewer state (ADR 0009 / CONTEXT.md **OSD
 * pass-through**): `null` until OpenSeadragon finishes initializing, then set to
 * the live `OpenSeadragon.Viewer`. A plugin that touches raw OSD (declaring the
 * `osd@5` capability) awaits readiness with {@link whenOsdReady} before reaching
 * for `osdViewer`, instead of polling or racing.
 *
 * Framework-neutral by construction: it reads `viewerState.osdViewer` and waits
 * on the framework-neutral `ViewerState.subscribe` fan-out — no Svelte runtime,
 * no OpenSeadragon import. The returned value is whatever core set (the raw
 * viewer), governed by OSD's own versioning.
 */

import type { ViewerState } from 'triiiceratops';

/** Options for {@link whenOsdReady}. */
export interface WhenOsdReadyOptions {
    /**
     * Abort the wait. When the signal fires before OSD is ready, the internal
     * `ViewerState` subscription is dropped (no leak past a plugin's teardown)
     * and the promise rejects with the signal's reason. Pass a controller you
     * abort from the plugin's cleanup so an OSD that never becomes ready does
     * not leave a dangling subscription.
     */
    signal?: AbortSignal;
}

/**
 * Resolve once the owning viewer's OSD readiness path has fired — i.e.
 * `osdViewer` is non-null. Resolves synchronously (a microtask) if OSD is
 * already ready; otherwise it waits on the batched notification path, so the
 * promise settles on the flush after core sets `osdViewer`.
 *
 * @param state The owning viewer's live state (from `PluginContext.viewerState`).
 * @param options Optional {@link WhenOsdReadyOptions} (e.g. an `AbortSignal`).
 * @returns A promise for the live OSD viewer once it is ready.
 */
export function whenOsdReady(
    state: ViewerState,
    options?: WhenOsdReadyOptions,
): Promise<NonNullable<ViewerState['osdViewer']>> {
    const ready = state.osdViewer;
    if (ready) return Promise.resolve(ready);

    const signal = options?.signal;
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);
            return;
        }
        const cleanup = (): void => {
            unsubscribe();
            signal?.removeEventListener('abort', onAbort);
        };
        const onAbort = (): void => {
            cleanup();
            reject(signal?.reason);
        };
        const unsubscribe = state.subscribe(() => {
            const viewer = state.osdViewer;
            if (viewer) {
                cleanup();
                resolve(viewer);
            }
        });
        signal?.addEventListener('abort', onAbort);
    });
}
