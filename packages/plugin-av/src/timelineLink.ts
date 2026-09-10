/**
 * Loading the timeline chunk: the one `await import()` in the eager graph that
 * reaches everything drawn over an audio canvas's lane.
 *
 * Eager and deliberately tiny, for the reason `waveformLink.ts` is: the part
 * that has to run on every canvas is only "does this canvas have a lane to
 * draw in", and the moment this module knew what a tick or a peak was, the
 * chunk would stop being on-demand. The specifier below is the key
 * `vite.config.ts`'s `LAZY_CHUNKS` map is written against, and it must stay
 * dynamic — a static import anywhere in the eager graph silently folds the
 * chunk into the entry, which `lazy-chunks.guard.test.ts` is what catches.
 */

/** The timeline chunk's public shape, as the eager side uses it. */
export type TimelineModule = typeof import('./timeline/index');

/**
 * Load the chunk, or `null`.
 *
 * A chunk that will not load — offline, a CSP that blocks it — is a non-event:
 * the lane still seeks by tap and the transport still scrubs, so the canvas
 * loses its graduations and nothing else. Not memoized, because the browser's
 * own module registry already resolves a second call to the first, and holding
 * a rejection would turn one bad moment into a permanent one.
 */
export async function loadTimeline(): Promise<TimelineModule | null> {
    try {
        return await import('./timeline/index');
    } catch {
        return null;
    }
}
