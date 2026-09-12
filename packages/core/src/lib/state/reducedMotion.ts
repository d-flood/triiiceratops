/**
 * `prefers-reduced-motion`, watched — the viewer's single source for it.
 *
 * There used to be two independent readings of this preference: the chrome
 * (gallery drawer, panel transitions) read `matchMedia(...).matches` once at
 * component init, and the Canvas2D renderer watched it. Those disagree the
 * moment a user changes the OS setting with the viewer open — the viewport
 * stops animating and the drawer goes on gliding — and "the viewer honors the
 * preference" then has two different answers depending on which half you look
 * at. One watcher, one answer.
 *
 * Watched rather than read once because the preference is a system setting a
 * user can change while the viewer is open, and someone turning it on is asking
 * for the motion to stop now, not at the next reload.
 *
 * Nothing here touches `window` at module scope, so it is safe in the SSR
 * module graph; a caller on the server is simply told `false` and never called
 * again.
 *
 * The viewer root runs the one watcher and publishes it to its chrome through
 * {@link provideReducedMotion}; chrome components read it with
 * {@link useReducedMotion} instead of starting watchers of their own.
 */

import { getContext, setContext } from 'svelte';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Call `onChange` with the preference now, and again whenever it changes.
 *
 * The immediate synchronous call is part of the contract: a caller that has to
 * consult the preference before its first frame (the renderer's initial fit,
 * for one) would otherwise have to read it a second way to cover the gap.
 *
 * Returns the unsubscribe. Callers that outlive nothing — a component that
 * never unmounts — still must call it: a `MediaQueryList` listener keeps the
 * closure, and through it the component, alive.
 */
export function watchReducedMotion(
    onChange: (reduced: boolean) => void,
): () => void {
    if (
        typeof window === 'undefined' ||
        typeof window.matchMedia !== 'function'
    ) {
        onChange(false);
        return () => {};
    }

    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    onChange(query.matches);

    const listener = (event: MediaQueryListEvent) => onChange(event.matches);
    // Optional-called: Safari below 14 and some test doubles implement only the
    // deprecated `addListener`, and a missing listener must degrade to "the
    // preference at subscribe time" rather than throwing on mount.
    query.addEventListener?.('change', listener);

    return () => query.removeEventListener?.('change', listener);
}

/**
 * A reactive holder for one viewer's `prefers-reduced-motion`. `current` is read
 * at the instant a transition or a scroll starts, so a preference changed with
 * the viewer open reaches the next one.
 */
export interface ReducedMotionSource {
    readonly current: boolean;
}

const REDUCED_MOTION_KEY = Symbol('triiiceratops:reducedMotion');

/**
 * Publish the owning viewer's live preference to its chrome subtree. Call once
 * at the viewer root, over its own {@link watchReducedMotion} subscription.
 */
export function provideReducedMotion(source: ReducedMotionSource): void {
    setContext(REDUCED_MOTION_KEY, source);
}

/**
 * The owning viewer's live preference. Outside any viewer subtree — a component
 * mounted bare in a test — it reports `false`, the same answer the SSR path
 * gives, so a component never has to guard the read.
 */
export function useReducedMotion(): ReducedMotionSource {
    return (
        getContext<ReducedMotionSource | undefined>(REDUCED_MOTION_KEY) ?? {
            current: false,
        }
    );
}
