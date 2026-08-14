/**
 * Loading the transcript panel's code.
 *
 * Eager and deliberately tiny, exactly as `waveformLink.ts` and
 * `sequencerLink.ts` are: the only thing that has to run without the chunk is
 * "does the current canvas offer a transcript at all", which the stage's loaded
 * caption tracks already answer. Everything that renders one is behind the
 * `await import()` below.
 *
 * A chunk that cannot be fetched leaves the panel without its transcript
 * section, exactly as a canvas with no VTT does. Nothing else degrades.
 */

/** The transcript chunk's public shape, as the eager side uses it. */
export type TranscriptModule = typeof import('./transcript/index');

/** Load the transcript chunk, or `null` if it cannot be fetched. */
export async function loadTranscript(): Promise<TranscriptModule | null> {
    try {
        return await import('./transcript/index');
    } catch {
        return null;
    }
}
