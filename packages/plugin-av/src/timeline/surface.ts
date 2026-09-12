/**
 * The waveform's drawing surface: a `<canvas>` nested inside the timeline lane,
 * plus the static strip the transport's scrubber shows.
 *
 * Part of the lazily-imported waveform chunk, along with the parsers and the
 * renderer: a stage builds a surface only once peaks have actually resolved, so
 * none of this needs to exist on a page that links no waveform data. The
 * geometry it places itself with is eager and shared with the ruler
 * (`../lane.ts`), which is the surface a bare lane draws instead.
 *
 * ## Why a nested canvas rather than a paint layer
 *
 * ADR 0016 puts pixels in the paint hook and operable targets in DOM, and the
 * waveform is unambiguously pixels: every seek it invites is already reachable
 * through the transport's real slider and through the lane's own tap handling.
 * But the paint hook draws into the RENDERER's canvas, which the plugin's
 * overlay layer sits on top of — and the stage is an opaque box (a black
 * backdrop, a lane with a panel background), so a waveform painted underneath it
 * would be invisible. The surface therefore goes inside the lane, where the
 * pixels can be seen, and the lane stays exactly the tap target ticket 09 made
 * it: `onLaneTap` resolves the surface to its lane with `closest`, and the seek
 * origin is the LANE's `getBoundingClientRect()`, so nesting cannot shift it.
 *
 * The surface declares no `pointer-events` of its own — the lane's hand-down to
 * the renderer works by making the lane transparent for one hit test, which an
 * `auto` on a descendant would defeat (see `styles.ts`).
 */

import {
    clipLaneWindow,
    createLaneCanvas,
    laneContext,
    laneScale,
    placeLaneCanvas,
    resolvedColor,
    type LaneWindow,
    type VisibleBox,
} from './lane';
import type { StageRect } from '../mediaStage';
import { peaksDuration, type Peaks } from './peaks';
import { drawWaveform } from './render';

export type { VisibleBox };

/** The static scrubber strip's rendering size, in device-independent pixels. */
const STRIP_WIDTH = 800;
const STRIP_HEIGHT = 40;

/** Colours are read off the lane so the waveform inherits the viewer's theme. */
const WAVE_COLOR = 'var(--tri-color-primary, #6ea8fe)';
const PLAYHEAD_COLOR = 'var(--tri-content, #fff)';

export interface WaveformSurface {
    /**
     * Position the surface for a lane box, or take it off screen when the lane
     * is not placed. `lane` is in the overlay container's coordinates.
     */
    place(lane: StageRect | null, visible: VisibleBox): void;
    /** Adopt the peaks the chunk resolved; repaints on the next `paint`. */
    setPeaks(peaks: Peaks): void;
    /** Redraw at this playhead position, in seconds of the canvas timeline. */
    paint(currentTime: number): void;
    destroy(): void;
}

export function createWaveformSurface(
    lane: HTMLElement,
    duration: () => number | null,
): WaveformSurface {
    const canvas = createLaneCanvas(lane, 'tri-av-waveform', 'av-waveform');

    let peaks: Peaks | null = null;
    let view: LaneWindow | null = null;

    return {
        place(rect: StageRect | null, visible: VisibleBox): void {
            view = clipLaneWindow(rect, visible, duration());
            placeLaneCanvas(canvas, view);
        },

        setPeaks(resolved: Peaks): void {
            peaks = resolved;
        },

        paint(currentTime: number): void {
            if (!peaks || !view || canvas.hidden) return;
            const scale = laneScale();
            const ctx = laneContext(canvas, view, scale);
            if (!ctx) return;

            drawWaveform(ctx, peaks, {
                width: view.width,
                height: view.height,
                scale,
                startTime: view.startTime,
                endTime: view.endTime,
                duration: view.duration,
                playhead: currentTime,
                waveColor: resolvedColor(lane, WAVE_COLOR),
                playheadColor: resolvedColor(lane, PLAYHEAD_COLOR),
            });
        },

        destroy(): void {
            canvas.remove();
            peaks = null;
        },
    };
}

/**
 * The static scrubber strip: the WHOLE peaks range, drawn once into an
 * offscreen surface and handed back as a data URL for the scrubber's background.
 *
 * A picture rather than a live surface because it never changes and never
 * responds: the played fill, the buffered spans and the thumb are what move over
 * it, and they are the scrubber's own DOM. It is how waveform data reaches a
 * video canvas, which gets no timeline lane in v1.
 */
export function renderPeaksStrip(peaks: Peaks): string | null {
    // A literal rather than a theme token: the strip is drawn offscreen, where
    // there is no element to resolve a custom property against, and it always
    // sits on the transport's own dark chrome. Translucent so the played fill
    // and the buffered spans stay legible through it.
    const color = 'rgb(255 255 255 / 0.4)';

    const canvas = document.createElement('canvas');
    canvas.width = STRIP_WIDTH;
    canvas.height = STRIP_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    drawWaveform(ctx, peaks, {
        width: STRIP_WIDTH,
        height: STRIP_HEIGHT,
        scale: 1,
        startTime: 0,
        // The strip is the whole clip and nothing positions anything against
        // it, so the peaks' own duration is the only timeline it needs.
        endTime: peaksDuration(peaks),
        duration: peaksDuration(peaks),
        playhead: null,
        waveColor: color,
        playheadColor: color,
    });

    try {
        return canvas.toDataURL('image/png');
    } catch {
        return null;
    }
}
