/** Resolves once the renderer has a sized surface and accepts commands. */

import type { ViewerState } from 'triiiceratops';

export interface WhenRendererReadyOptions {
    signal?: AbortSignal;
}

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
