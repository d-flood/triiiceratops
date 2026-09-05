/**
 * The waveform chunk's entry point.
 *
 * Everything that knows what waveform data IS — both parsers and the renderer —
 * is reachable only from here, and this module is only ever reached through the
 * `await import()` in `../waveformLink.ts`. A page whose manifests link no
 * waveform data never fetches these bytes (SPEC user story 37).
 */

export { parsePeaks, peaksDuration, type Peaks } from './peaks';
export { drawWaveform, type WaveformView } from './render';
export {
    createWaveformSurface,
    renderPeaksStrip,
    type VisibleBox,
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
