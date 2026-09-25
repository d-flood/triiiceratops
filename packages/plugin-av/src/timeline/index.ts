/**
 * The timeline chunk's entry point: everything that draws over an audio
 * canvas's lane.
 *
 * Two drawings and the geometry they share. The **ruler** is the graduations a
 * lane always gets — ticks, clock labels, the played span and the playhead.
 * The **waveform** replaces it where the canvas links `audiowaveform` data,
 * and brings the parsers that read it.
 *
 * All of it is reachable only through the `await import()` in
 * `../timelineLink.ts`, so a page with no audio canvas to graduate never
 * fetches these bytes: a page of images or of video requests nothing.
 *
 * The chunk is **self-contained** and must stay that way. It may take types
 * from the eager graph, never values: the IIFE build cannot code-split, and
 * takes each lazy module out of its graph by rewriting the specifier into a
 * runtime URL (`vite.config.ts`), which a module shared with the entry would
 * defeat. Anything the ruler needs from eager code — the transport's clock —
 * is handed in.
 */

export { clipLaneWindow, type LaneWindow, type VisibleBox } from './lane';
export { parsePeaks, peaksDuration, type Peaks } from './peaks';
export { drawWaveform, type WaveformView } from './render';
export {
    chooseTickStep,
    createRulerSurface,
    drawRuler,
    formatTickLabel,
    type Clock,
    type RulerSurface,
    type RulerView,
} from './ruler';
export {
    createWaveformSurface,
    renderPeaksStrip,
    type WaveformSurface,
} from './surface';

import { parsePeaks, type Peaks } from './peaks';

/**
 * Fetch and parse the linked waveform data.
 *
 * Every failure — a dead URL, a CORS refusal, bytes of neither format — answers
 * `null`. A waveform is an enhancement over a lane that already works, so its
 * absence is never error chrome and never a `pluginerror`; the caller announces
 * it once on the developer console instead.
 */
export async function fetchPeaks(
    url: string,
    signal?: AbortSignal,
): Promise<Peaks | null> {
    try {
        const response = await fetch(url, { signal });
        if (!response.ok) return null;
        return parsePeaks(await response.arrayBuffer());
    } catch {
        return null;
    }
}
