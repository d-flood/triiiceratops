/**
 * Renderer-readiness helper.
 *
 * **This is not `whenOsdReady` renamed.** That helper meant "the third-party
 * viewer object exists — here it is, you may touch it", and it resolved WITH
 * that object. With no pass-through there is nothing to hand over, so the two
 * are not interchangeable and carrying the old semantics forward under a new
 * name would have been the wrong half of the choice the spec forces.
 *
 * The decision taken: the helper **becomes a first-paint signal** rather than
 * retiring. It resolves `void`, and what it promises is that the renderer has a
 * **sized surface and accepts commands** — i.e. that
 * `ViewerState.viewportScale` / `viewportCentre` / `viewportBounds` /
 * `containerSize` answer with real numbers instead of zeroes and `null`s, and
 * that `zoomTo`, `panTo`, `fitBounds`, and `fitCanvas` will do something rather
 * than no-op.
 *
 * It survives rather than retiring because the question it answers is still
 * asked, by anything that has to place something over the image: a plugin
 * measuring where a canvas point lands on screen before the surface is sized
 * gets an honest `null`, and polling for it is exactly what a readiness helper
 * exists to prevent.
 *
 * Framework-neutral by construction: it reads `viewerState.rendererReady` and
 * waits on the framework-neutral `ViewerState.subscribe` fan-out — no Svelte
 * runtime, no renderer import, and no renderer object anywhere in the result.
 */

import type { ViewerState } from 'triiiceratops';

/** Options for {@link whenRendererReady}. */
export interface WhenRendererReadyOptions {
    /**
     * Abort the wait. When the signal fires before the renderer is ready, the
     * internal `ViewerState` subscription is dropped (no leak past a plugin's
     * teardown) and the promise rejects with the signal's reason. Pass a
     * controller you abort from the plugin's cleanup so a viewer that never
     * mounts a renderer does not leave a dangling subscription.
     */
    signal?: AbortSignal;
}

/**
 * Resolve once the owning viewer's renderer has a sized surface and accepts
 * commands. Resolves synchronously (a microtask) if it already does; otherwise
 * it waits on the batched notification path, so the promise settles on the
 * flush after core marks the renderer ready — `rendererReady` is an inventoried
 * observable member.
 *
 * Resolves `void`, deliberately: there is no object to hand out, and a helper
 * that returned one would be the pass-through rebuilt.
 *
 * Note that readiness is not permanent. A renderer that unmounts sets
 * `rendererReady` back to `false`; this helper answers "is it ready now (or
 * when next it becomes ready)", not "has it ever been ready".
 *
 * @param state The owning viewer's live state (from `PluginContext.viewerState`).
 * @param options Optional {@link WhenRendererReadyOptions} (e.g. an `AbortSignal`).
 */
export function whenRendererReady(
    state: ViewerState,
    options?: WhenRendererReadyOptions,
): Promise<void> {
    if (state.rendererReady) return Promise.resolve();

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
            if (state.rendererReady) {
                cleanup();
                resolve();
            }
        });
        signal?.addEventListener('abort', onAbort);
    });
}
