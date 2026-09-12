import { afterEach, describe, expect, it, vi } from 'vitest';

import { REDUCED_MOTION_QUERY, watchReducedMotion } from './reducedMotion';

/**
 * A `MediaQueryList` double that records its listeners and can flip.
 *
 * The point of the module is that a change reaches every consumer *while the
 * viewer is open*, so what has to be asserted is the callback after the flip —
 * not the value at subscribe time, which any one-shot read would also get
 * right.
 */
function fakeMatchMedia(initial: boolean) {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const query = {
        matches: initial,
        addEventListener: vi.fn(
            (_type: string, listener: (event: MediaQueryListEvent) => void) => {
                listeners.add(listener);
            },
        ),
        removeEventListener: vi.fn(
            (_type: string, listener: (event: MediaQueryListEvent) => void) => {
                listeners.delete(listener);
            },
        ),
    };
    return {
        query,
        matchMedia: vi.fn(() => query as unknown as MediaQueryList),
        flip(matches: boolean) {
            query.matches = matches;
            for (const listener of listeners) {
                listener({ matches } as MediaQueryListEvent);
            }
        },
        listenerCount: () => listeners.size,
    };
}

const original = window.matchMedia;

afterEach(() => {
    window.matchMedia = original;
});

describe('watchReducedMotion', () => {
    it('reports the preference synchronously at subscribe time', () => {
        const media = fakeMatchMedia(true);
        window.matchMedia = media.matchMedia;

        const seen: boolean[] = [];
        watchReducedMotion((reduced) => seen.push(reduced));

        expect(media.matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
        // Synchronous, not on a microtask: a caller that must consult the
        // preference before its first frame has no second chance.
        expect(seen).toEqual([true]);
    });

    it('reports later changes to the preference', () => {
        const media = fakeMatchMedia(false);
        window.matchMedia = media.matchMedia;

        const seen: boolean[] = [];
        watchReducedMotion((reduced) => seen.push(reduced));
        media.flip(true);
        media.flip(false);

        expect(seen).toEqual([false, true, false]);
    });

    it('stops reporting once unsubscribed', () => {
        const media = fakeMatchMedia(false);
        window.matchMedia = media.matchMedia;

        const seen: boolean[] = [];
        const stop = watchReducedMotion((reduced) => seen.push(reduced));
        stop();
        media.flip(true);

        expect(seen).toEqual([false]);
        expect(media.listenerCount()).toBe(0);
    });

    it('reports "no preference" where matchMedia is unavailable', () => {
        // The shape of an SSR render, and of an old engine: the caller must get
        // an answer and a working unsubscribe rather than a throw on mount.
        (window as { matchMedia?: unknown }).matchMedia = undefined;

        const seen: boolean[] = [];
        const stop = watchReducedMotion((reduced) => seen.push(reduced));

        expect(seen).toEqual([false]);
        expect(() => stop()).not.toThrow();
    });
});
