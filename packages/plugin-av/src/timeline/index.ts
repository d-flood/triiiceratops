/** Timeline chunk entry; self-contained, reached only via `timelineLink`. */

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
