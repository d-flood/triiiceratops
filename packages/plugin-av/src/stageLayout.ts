/**
 * The **stage layout**: how a claimed canvas's rect is divided into lanes.
 *
 * A division of the SAME rect, in canvas space, so the whole stack pans and
 * zooms with the canvas it belongs to. That is what separates it from the
 * transport, which is anchored to the rect but sized in screen pixels.
 *
 * Pure arithmetic, deliberately: a lane split is the thing a test can state
 * exactly, and the stage's job is only to write the numbers onto elements.
 */

import type { StageRect } from './mediaStage';

/**
 * Which lanes a canvas gets, chosen by **what core paints in this rect**:
 *
 * - `video` — core paints nothing and the picture is the element, so the visual
 *   lane fills the rect. Waveform data on video appears inside the scrubber.
 * - `audio-with-image` — core paints a companion Canvas here, so the plugin
 *   draws no lanes at all: the rect belongs to the renderer, and the stage
 *   contributes only a tap target, the glyph and the "can't play" notice.
 * - `audio` — nothing to look at either way, so the timeline lane fills the
 *   rect and carries the waveform.
 */
export type StageLayoutKind = 'video' | 'audio' | 'audio-with-image';

/**
 * The lanes of one stage, in the coordinate space the rect was given in.
 * A `null` lane is one this layout does not have — not a hidden one.
 */
export interface StageLanes {
    readonly visual: StageRect | null;
    readonly timeline: StageRect | null;
}

/**
 * Which layout a scanned canvas gets.
 *
 * Driven by what is drawn in the rect and never by which element plays the
 * body. The two part company on `0014-accompanyingcanvas`, whose body is a
 * `Sound` formatted `video/mp4`: `<video>` is the only element that will play
 * it, but the canvas is duration-only and its picture is the companion Canvas
 * core paints — so the plugin must keep out of the rect rather than cover the
 * score with the element that happens to be decoding the sound.
 */
export function stageLayoutKind(
    canvasPaintsPicture: boolean,
    corePaintsCompanion: boolean,
): StageLayoutKind {
    if (canvasPaintsPicture) return 'video';
    return corePaintsCompanion ? 'audio-with-image' : 'audio';
}

/**
 * Divide a rect into its lanes.
 *
 * A canvas core paints a companion into gets none: whatever the plugin drew
 * there would sit above the renderer's canvas (`z-index: 40`) and hide it.
 */
export function stageLanes(
    rect: StageRect,
    layout: StageLayoutKind,
): StageLanes {
    if (layout === 'video') return { visual: rect, timeline: null };
    if (layout === 'audio') return { visual: null, timeline: rect };
    return { visual: null, timeline: null };
}

/** What the overlay container's box leaves showing of a projected rect. */
export interface StageClip {
    /** No part of the rect falls inside the container. */
    readonly hidden: boolean;
    /**
     * The stage's `clip-path`, in the stage's own coordinates — `'none'` where
     * the whole projection is inside the container.
     */
    readonly clipPath: string;
}

/**
 * Clip a projected rect to the overlay container's own box.
 *
 * A projection is not bounded by the container: a canvas fitted to the viewer's
 * height overhangs it left and right, and any zoom overhangs it in both axes.
 * The overhang has to go, because the stage's lanes take pointer events — an
 * unclipped audio lane, which fills its whole rect, reaches out over the side
 * columns and swallows taps aimed at the toolbar and the panels there.
 *
 * `clip-path` rather than a smaller box: the box IS the projection (the lanes
 * divide the canvas, and the waveform's geometry is measured against it), and
 * clipping takes the overhang out of hit testing as well as out of the picture,
 * which shrinking the box would only do by restretching the layout. So the
 * answer is the four insets — the clipped rect was only ever an intermediate on
 * the way to them, and computing it separately meant computing them twice.
 *
 * A container with no measured box (before layout, and in jsdom) clips nothing:
 * the rect is unknown rather than empty, and hiding every stage would be worse
 * than drawing one that may overhang.
 */
export function stageClip(
    rect: StageRect,
    visible: { readonly width: number; readonly height: number },
): StageClip {
    if (!(visible.width > 0) || !(visible.height > 0))
        return { hidden: false, clipPath: 'none' };

    const top = Math.max(-rect.top, 0);
    const left = Math.max(-rect.left, 0);
    const right = Math.max(rect.left + rect.width - visible.width, 0);
    const bottom = Math.max(rect.top + rect.height - visible.height, 0);

    if (!(rect.width > left + right) || !(rect.height > top + bottom))
        return { hidden: true, clipPath: 'none' };
    if (top === 0 && left === 0 && right === 0 && bottom === 0)
        return { hidden: false, clipPath: 'none' };

    return {
        hidden: false,
        clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px)`,
    };
}

/**
 * Where along a lane a point at `offsetX` falls, as `0..1` — the **timeline
 * projection** in its simplest form, and the whole of tap-to-seek's geometry.
 *
 * Clamped rather than refused: a pointer event's offset can land a fraction of
 * a pixel outside the box it was dispatched on.
 */
export function laneFraction(
    offsetX: number,
    laneWidth: number,
): number | null {
    if (!Number.isFinite(offsetX) || !(laneWidth > 0)) return null;
    return Math.min(Math.max(offsetX / laneWidth, 0), 1);
}
