import { untrack } from 'svelte';

import { logger } from '../logging/logger';
import type { ViewerState } from '../state/viewer.svelte';
import { isViewStable } from '../state/viewStability';
import type { ViewerError } from '../types/viewerError';
import { captureViewTarget, serializeContentState } from './contentState';
import { once } from './once';

const claims = new Map<string, number>();

export function startContentStateWriter(
    state: ViewerState,
    { param, report }: { param: string; report: (error: ViewerError) => void },
): () => void {
    if (typeof window === 'undefined') return () => {};

    const capture = () => {
        const target = captureViewTarget(state);
        return target ? serializeContentState(target) : undefined;
    };
    // Seed a settled view immediately because subscribeSettled skips it.
    let previous = untrack(() =>
        state.viewportBounds && isViewStable(state) ? capture() : undefined,
    );
    let reported = false;

    const unsubscribe = state.subscribeSettled(() => {
        const playback = state.transportChrome[0]?.view();
        if (playback?.present && !playback.paused) return;

        const value = capture();
        if (value === undefined || value === previous) return;
        if (previous === undefined) {
            previous = value;
            return;
        }

        const url = new URL(location.href);
        url.searchParams.set(param, value);
        try {
            history.replaceState(history.state, '', url);
            previous = value;
        } catch (error) {
            if (reported) return;
            reported = true;
            report({
                severity: 'warning',
                scope: 'content-state',
                code: 'content-state-write-failed',
                message: 'Could not write the settled view to the page URL.',
                error,
            });
        }
    });

    const currentClaims = claims.get(param) ?? 0;
    claims.set(param, currentClaims + 1);
    if (currentClaims) {
        logger.warn(
            `Multiple viewers write to the content state URL parameter "${param}".`,
        );
    }

    return once(() => {
        const remaining = claims.get(param)! - 1;
        if (remaining) claims.set(param, remaining);
        else claims.delete(param);
        unsubscribe();
    });
}
