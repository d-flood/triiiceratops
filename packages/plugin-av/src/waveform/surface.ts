/**
 * The waveform's drawing surface: a `<canvas>` nested inside the timeline lane,
 * plus the static strip the transport's scrubber shows.
 *
 * Part of the lazily-imported waveform chunk, along with the parsers and the
 * renderer: a stage builds a surface only once peaks have actually resolved, so
 * none of this geometry needs to exist on a page that links no waveform data.
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
 *
 * ## Why the surface is not the size of the lane
 *
 * The lane is a projection: at a deep zoom it is tens of thousands of pixels
 * wide, and a backing store that size is megabytes of memory for pixels nobody
 * can see. The surface is instead the lane clipped to the visible overlay area,
 * and the time window it draws is the slice of the timeline projection that
 * window covers. That clipping IS the temporal zoom: zooming in narrows
 * `[startTime, endTime]` over a surface of roughly constant size, so each column
 * covers fewer peaks and the drawing sharpens — down to the data's own
 * resolution and no further (see `waveform/render.ts`).
 */

import type { StageRect } from '../mediaStage';
import { peaksDuration, type Peaks } from './peaks';
import { drawWaveform } from './render';

/** The area of the overlay container a reader can actually see. */
export interface VisibleBox {
    readonly width: number;
    readonly height: number;
}

/** The static scrubber strip's rendering size, in device-independent pixels. */
const STRIP_WIDTH = 800;
const STRIP_HEIGHT = 40;

/** Colours are read off the lane so the waveform inherits the viewer's theme. */
const WAVE_COLOR = 'var(--tri-color-primary, #6ea8fe)';
const PLAYHEAD_COLOR = 'var(--tri-content, #fff)';

function resolvedColor(from: HTMLElement, value: string): string {
    const custom = /^var\((--[^,)]+),\s*([^)]*)\)$/.exec(value);
    if (!custom) return value;
    const resolved = getComputedStyle(from).getPropertyValue(custom[1]).trim();
    return resolved || custom[2].trim();
}

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
    const canvas = document.createElement('canvas');
    canvas.className = 'tri-av-waveform';
    canvas.dataset.testid = 'av-waveform';
    // Decorative: the shape of the sound, over a lane whose seek behaviour and
    // whose accessible equivalent (the transport slider) are elsewhere.
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = true;
    lane.append(canvas);

    let peaks: Peaks | null = null;
    let drawnRange: {
        startTime: number;
        endTime: number;
        duration: number;
    } | null = null;
    let box = { width: 0, height: 0 };

    return {
        place(rect: StageRect | null, visible: VisibleBox): void {
            const total = duration();
            const clipped =
                rect && total !== null && total > 0
                    ? {
                          left: Math.max(rect.left, 0),
                          top: Math.max(rect.top, 0),
                          right: Math.min(
                              rect.left + rect.width,
                              visible.width,
                          ),
                          bottom: Math.min(
                              rect.top + rect.height,
                              visible.height,
                          ),
                      }
                    : null;

            if (
                !clipped ||
                !rect ||
                total === null ||
                clipped.right - clipped.left <= 0 ||
                clipped.bottom - clipped.top <= 0
            ) {
                canvas.hidden = true;
                drawnRange = null;
                return;
            }

            canvas.hidden = false;
            box = {
                width: clipped.right - clipped.left,
                height: clipped.bottom - clipped.top,
            };
            canvas.style.left = `${clipped.left - rect.left}px`;
            canvas.style.top = `${clipped.top - rect.top}px`;
            canvas.style.width = `${box.width}px`;
            canvas.style.height = `${box.height}px`;

            drawnRange = {
                startTime: ((clipped.left - rect.left) / rect.width) * total,
                endTime: ((clipped.right - rect.left) / rect.width) * total,
                // The MEDIA's duration, which is what the lane's x-axis and
                // every seek off it are measured in; the peaks are stretched
                // onto it rather than drawn against their own (render.ts).
                duration: total,
            };
            // The drawn range is the observable half of temporal zoom, and the
            // only one an end-to-end test can read: zooming in must narrow it.
            canvas.dataset.rangeStart = drawnRange.startTime.toFixed(3);
            canvas.dataset.rangeEnd = drawnRange.endTime.toFixed(3);
        },

        setPeaks(resolved: Peaks): void {
            peaks = resolved;
        },

        paint(currentTime: number): void {
            if (!peaks || !drawnRange || canvas.hidden) return;

            const scale = Math.min(globalThis.devicePixelRatio || 1, 2);
            const backingWidth = Math.max(Math.round(box.width * scale), 1);
            const backingHeight = Math.max(Math.round(box.height * scale), 1);
            // Assigning either dimension clears the surface, so it is done only
            // when the size actually changed rather than on every frame.
            if (canvas.width !== backingWidth) canvas.width = backingWidth;
            if (canvas.height !== backingHeight) canvas.height = backingHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            drawWaveform(ctx, peaks, {
                width: box.width,
                height: box.height,
                scale,
                startTime: drawnRange.startTime,
                endTime: drawnRange.endTime,
                duration: drawnRange.duration,
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
