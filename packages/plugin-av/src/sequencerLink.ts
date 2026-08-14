/**
 * Loading the code that plays a temporally composed canvas.
 *
 * Eager and deliberately tiny, exactly as `waveformLink.ts` is: the only thing
 * that has to run on every canvas is "does this one paint more than one
 * time-based body", which `scanCanvasForAv` already answered
 * (`temporallyComposed`). Everything that knows what a segment IS lives behind
 * the `await import()` below.
 *
 * The chunk is not an enhancement over a working canvas the way a waveform is —
 * a composed canvas it never reaches plays only its first body — but the
 * failure mode is the same shape: the stage stays up, one body plays, and the
 * viewer does not fail.
 */

/** The sequencer chunk's public shape, as the eager side uses it. */
export type SequencerModule = typeof import('./sequencer/index');

/** Load the sequencer chunk, or `null` if it cannot be fetched. */
export async function loadSequencer(): Promise<SequencerModule | null> {
    try {
        return await import('./sequencer/index');
    } catch {
        return null;
    }
}
