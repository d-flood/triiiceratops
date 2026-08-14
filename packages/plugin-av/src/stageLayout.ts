/**
 * The **stage layout**: how a claimed canvas's rect is divided into lanes.
 *
 * A vertical split of the SAME rect, in canvas space, so the whole stack pans
 * and zooms with the canvas it belongs to. That is what separates it from the
 * transport, which is anchored to the rect but sized in screen pixels.
 *
 * Pure arithmetic, deliberately: a lane split is the thing a test can state
 * exactly, and the stage's job is only to write the numbers onto elements.
 */

import type { StageRect } from './mediaStage';

/**
 * Which lanes a canvas gets. Fixed for v1 (SPEC — "Rendering: stage layout"):
 *
 * - `video` — the visual lane fills the rect. Video canvases get no timeline
 *   lane; waveform data on video appears inside the scrubber instead.
 * - `audio` — nothing to look at, so the timeline lane fills the rect.
 * - `audio-with-image` — the accompanying image above, a timeline strip below.
 */
export type StageLayoutKind = 'video' | 'audio' | 'audio-with-image';

/** How much of the rect the timeline strip takes when it shares it (v1). */
export const TIMELINE_LANE_FRACTION = 0.25;

/**
 * The lanes of one stage, in the coordinate space the rect was given in.
 * A `null` lane is one this layout does not have — not a hidden one.
 */
export interface StageLanes {
    readonly visual: StageRect | null;
    readonly timeline: StageRect | null;
}

/** Which layout a scanned canvas gets, given whether it has an image to show. */
export function stageLayoutKind(
    mediaKind: 'audio' | 'video',
    hasAccompanyingImage: boolean,
): StageLayoutKind {
    if (mediaKind === 'video') return 'video';
    return hasAccompanyingImage ? 'audio-with-image' : 'audio';
}

/**
 * Divide a rect into its lanes.
 *
 * The split is by fraction rather than by a pixel height, because the rect is a
 * projection: at any zoom the strip stays the same share of the canvas, which
 * is what "in canvas space" means for a reader who is zooming.
 */
export function stageLanes(
    rect: StageRect,
    layout: StageLayoutKind,
): StageLanes {
    if (layout === 'video') return { visual: rect, timeline: null };
    if (layout === 'audio') return { visual: null, timeline: rect };

    const timelineHeight = rect.height * TIMELINE_LANE_FRACTION;
    return {
        visual: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height - timelineHeight,
        },
        timeline: {
            left: rect.left,
            top: rect.top + (rect.height - timelineHeight),
            width: rect.width,
            height: timelineHeight,
        },
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
