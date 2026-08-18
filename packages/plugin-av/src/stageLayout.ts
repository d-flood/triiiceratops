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

/**
 * The part of a projected rect that falls inside the overlay container's own
 * box, or `null` when none of it does.
 *
 * A projection is not bounded by the container: a canvas fitted to the viewer's
 * height overhangs it left and right, and any zoom overhangs it in both axes.
 * The stage box has to be the CLIPPED rect rather than the projected one,
 * because the stage's lanes take pointer events — an unclipped audio lane, which
 * fills its whole rect, reaches out over the side columns and swallows taps
 * aimed at the toolbar and the panels there. The lanes still divide the FULL
 * rect; only the box drawn around them is trimmed.
 *
 * A container with no measured box (before layout, and in jsdom) clips nothing:
 * the rect is unknown rather than empty, and hiding every stage would be worse
 * than drawing one that may overhang.
 */
export function clipRect(
    rect: StageRect,
    visible: { readonly width: number; readonly height: number },
): StageRect | null {
    if (!(visible.width > 0) || !(visible.height > 0)) return rect;

    const left = Math.max(rect.left, 0);
    const top = Math.max(rect.top, 0);
    const right = Math.min(rect.left + rect.width, visible.width);
    const bottom = Math.min(rect.top + rect.height, visible.height);
    if (!(right > left) || !(bottom > top)) return null;

    return { left, top, width: right - left, height: bottom - top };
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
