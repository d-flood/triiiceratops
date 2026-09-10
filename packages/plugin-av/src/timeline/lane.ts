/**
 * The plumbing every drawing over the timeline lane shares: which part of a
 * projected lane is on screen, what span of the recording that part covers, and
 * the `<canvas>` it is drawn into.
 *
 * A projected lane is not bounded by the viewer. At a deep zoom it is tens of
 * thousands of pixels wide, and a backing store that size is megabytes of
 * pixels nobody can see, so a surface over the lane is the lane CLIPPED to the
 * visible area, drawing the slice of the timeline projection that area covers.
 * That clipping IS the temporal zoom: zooming in narrows
 * `[startTime, endTime]` over a surface of roughly constant width, so each
 * column covers less time and the drawing sharpens.
 *
 * Eager, because the ruler is: every bare audio canvas draws one. The waveform
 * surface arrives with the lazy chunk and reaches back here for the same
 * geometry rather than carrying a second copy of it — the arithmetic is subtle
 * enough that two copies would drift, and the two surfaces graduate the same
 * window.
 */

import type { StageRect } from '../mediaStage';

/** The area of the overlay container a reader can actually see. */
export interface VisibleBox {
    readonly width: number;
    readonly height: number;
}

/** The on-screen slice of a projected lane, and the time it covers. */
export interface LaneWindow {
    /** The slice's box, in the LANE's own coordinates. */
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    /** Canvas time at the slice's left and right edges. */
    readonly startTime: number;
    readonly endTime: number;
    /**
     * The MEDIA's duration, which is what the lane's x-axis and every seek off
     * it are measured in.
     */
    readonly duration: number;
}

/**
 * Clip a projected lane to the visible area, in time as well as in pixels.
 *
 * `null` for a lane that is not placed, has no known length, or has no visible
 * area left — all of which mean "draw nothing" rather than "draw an empty box".
 */
export function clipLaneWindow(
    rect: StageRect | null,
    visible: VisibleBox,
    duration: number | null,
): LaneWindow | null {
    if (!rect || !(rect.width > 0)) return null;
    if (duration === null || !(duration > 0)) return null;

    const left = Math.max(rect.left, 0);
    const top = Math.max(rect.top, 0);
    const right = Math.min(rect.left + rect.width, visible.width);
    const bottom = Math.min(rect.top + rect.height, visible.height);
    if (!(right > left) || !(bottom > top)) return null;

    return {
        left: left - rect.left,
        top: top - rect.top,
        width: right - left,
        height: bottom - top,
        startTime: ((left - rect.left) / rect.width) * duration,
        endTime: ((right - rect.left) / rect.width) * duration,
        duration,
    };
}

/**
 * Resolve a `var(--token, fallback)` against the lane, so a surface inherits
 * the viewer's theme. Any other value is already a colour and passes through.
 */
export function resolvedColor(from: HTMLElement, value: string): string {
    const custom = /^var\((--[^,)]+),\s*([^)]*)\)$/.exec(value);
    if (!custom) return value;
    const resolved = getComputedStyle(from).getPropertyValue(custom[1]).trim();
    return resolved || custom[2].trim();
}

/**
 * A drawing surface nested inside the lane.
 *
 * Hidden from assistive technology because it is decoration over geometry the
 * DOM already carries: every seek it invites is reachable through the
 * transport's real slider and through the lane's own tap handling (ADR 0016).
 * It declares no `pointer-events` either — the lane hands a drag down to the
 * renderer by going transparent for one hit test, which an `auto` on a
 * descendant would defeat.
 */
export function createLaneCanvas(
    lane: HTMLElement,
    className: string,
    testid: string,
): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = className;
    canvas.dataset.testid = testid;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = true;
    lane.append(canvas);
    return canvas;
}

/** Position a surface for its window, or take it off screen when it has none. */
export function placeLaneCanvas(
    canvas: HTMLCanvasElement,
    view: LaneWindow | null,
): void {
    if (!view) {
        canvas.hidden = true;
        return;
    }
    canvas.hidden = false;
    canvas.style.left = `${view.left}px`;
    canvas.style.top = `${view.top}px`;
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
    // The drawn range is the observable half of temporal zoom, and the only one
    // an end-to-end test can read: zooming in must narrow it.
    canvas.dataset.rangeStart = view.startTime.toFixed(3);
    canvas.dataset.rangeEnd = view.endTime.toFixed(3);
}

/** The backing-store ratio a surface is drawn at. Capped: past 2 it is memory for nothing. */
export function laneScale(): number {
    return Math.min(globalThis.devicePixelRatio || 1, 2);
}

/**
 * Size the backing store for a window and hand back a context whose units are
 * CSS pixels.
 *
 * Assigning either dimension clears the surface, so it is done only when the
 * size actually changed rather than on every frame.
 */
export function laneContext(
    canvas: HTMLCanvasElement,
    view: LaneWindow,
    scale: number,
): CanvasRenderingContext2D | null {
    const backingWidth = Math.max(Math.round(view.width * scale), 1);
    const backingHeight = Math.max(Math.round(view.height * scale), 1);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    return ctx;
}
