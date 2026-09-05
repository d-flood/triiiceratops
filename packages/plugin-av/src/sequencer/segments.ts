/**
 * The **canvas timeline** of a temporally composed canvas: the segment map, and
 * the mapping between canvas time and a (segment, element-time offset) pair.
 *
 * Pure, and the only module in this package that knows what a `t=` window
 * means. Everything outside the sequencer speaks canvas time — 0 to the
 * canvas's duration — and this is where that promise is made good.
 *
 * ## Coordinates
 *
 * A painting annotation's target fragment gives its window ON THE CANVAS
 * TIMELINE. The body itself always plays from its own zero, so a segment's
 * element time is `canvasTime - segment.start`. (A `t=` on the BODY — a
 * `SpecificResource` source with its own fragment — would say otherwise; no
 * vendored recipe uses one and this release does not read it.)
 *
 * ## Normalization
 *
 * Real manifests are not guaranteed to tile a duration cleanly, so three shapes
 * are defined rather than left to chance, each announced once to the developer
 * console:
 *
 * - **A body with no `t=` on a multi-body canvas** claims no window, and a body
 *   that claimed the whole duration would swallow every sibling. It is dropped.
 * - **Overlapping windows**: the earlier body wins, and the later one starts
 *   where the earlier one ends. A window entirely covered by an earlier one is
 *   dropped.
 * - **A gap** between windows plays as nothing at all: the playhead skips
 *   forward to the next window's start, and a seek into a gap lands there too.
 */

import type { AvPlacement, AvSource } from '../sources';

/** One body's window on the canvas timeline, with the media that fills it. */
export interface Segment {
    /** Canvas time this segment starts at, inclusive. */
    readonly start: number;
    /** Canvas time this segment ends at. */
    readonly end: number;
    /** The placement's index among the canvas's painting annotations. */
    readonly annotation: number;
    /** The renditions this segment could play — `formats.ts` picks one. */
    readonly alternatives: readonly AvSource[];
}

/** A composed canvas's whole timeline. */
export interface SegmentMap {
    /** The canvas timeline's length in seconds. */
    readonly duration: number;
    /** The segments, ordered and non-overlapping. */
    readonly segments: readonly Segment[];
}

/** Where a canvas time lands: which segment plays it, and how far into it. */
export interface SegmentPosition {
    readonly index: number;
    /** The segment's own element time, in seconds from its start. */
    readonly offset: number;
}

function warn(message: string): void {
    // triiiceratops-console-allow: the curator-facing degradation channel of
    // user story 45, the same one `degradation.ts` uses. It lives here rather
    // than there because this whole module is lazily loaded and nothing eager
    // may reach it. Recorded in lint-allowlist.md.
    console.warn(`[triiiceratops] ${message}`);
}

/**
 * The `t=` window on a target fragment, or `null` when it carries none this
 * release can read.
 *
 * Only plain seconds, with the optional `npt:` scheme prefix media fragments
 * allow. Normal-play-time clock forms (`00:03:00`) and the other schemes
 * (`smpte`, `clock`) are not produced by any vendored recipe, and a body whose
 * window cannot be read is dropped rather than guessed at.
 */
export function temporalWindow(
    fragment: string,
): { start: number; end: number | null } | null {
    const match = /(?:^|&)t=(?:npt:)?([^&]*)/.exec(fragment);
    if (!match) return null;

    const [rawStart, rawEnd] = match[1].split(',');
    // `t=,20` is a legal media fragment meaning "from the beginning".
    const start = rawStart === '' ? 0 : Number(rawStart);
    const end = rawEnd === undefined || rawEnd === '' ? null : Number(rawEnd);

    if (!Number.isFinite(start) || start < 0) return null;
    if (end !== null && !(Number.isFinite(end) && end > start)) return null;
    return { start, end };
}

/**
 * Build a composed canvas's segment map.
 *
 * `canvasDuration` is the manifest's declared duration, which is what closes an
 * open-ended final window (`#t=3971.24`) and what clamps a window authored past
 * the end of the canvas.
 */
export function buildSegmentMap(
    placements: readonly AvPlacement[],
    canvasDuration: number | null,
): SegmentMap {
    const windowed: {
        placement: AvPlacement;
        start: number;
        end: number | null;
    }[] = [];
    let warnedWindowless = false;
    for (const placement of placements) {
        const authored = temporalWindow(placement.fragment);
        if (!authored) {
            if (!warnedWindowless) {
                warnedWindowless = true;
                warn(
                    `A painting annotation on a temporally composed canvas ` +
                        `targets no \`t=\` window ` +
                        `(${placement.alternatives[0]?.url}, the first of any). ` +
                        `A body that claims no window on a canvas its siblings ` +
                        `tile cannot be placed on the canvas timeline, so it ` +
                        `is not played.`,
                );
            }
            continue;
        }
        windowed.push({ placement, ...authored });
    }
    windowed.sort((a, b) => a.start - b.start);

    const segments: Segment[] = [];
    let cursor = 0;
    let warnedOverlap = false;
    let warnedGap = false;

    windowed.forEach((authored, index) => {
        // An open-ended window runs to the next one, or to the end of the
        // canvas. With neither there is no length to play, so it is dropped.
        const declaredEnd =
            authored.end ?? windowed[index + 1]?.start ?? canvasDuration;
        if (declaredEnd === null) return;

        const end =
            canvasDuration === null
                ? declaredEnd
                : Math.min(declaredEnd, canvasDuration);
        // The earlier body wins the overlap: a later window starts where the
        // one before it ended, and one entirely covered plays not at all.
        const start = Math.max(authored.start, cursor);

        if (authored.start < cursor && !warnedOverlap) {
            warnedOverlap = true;
            warn(
                `Two painting annotations on a temporally composed canvas claim ` +
                    `overlapping \`t=\` windows. The earlier body keeps the ` +
                    `overlap and the later one starts where it ends.`,
            );
        }
        // A LEADING gap counts: an unpainted first five seconds is exactly what
        // a curator wants told, and `cursor` starts at the canvas's zero.
        if (authored.start > cursor && !warnedGap) {
            warnedGap = true;
            warn(
                `A temporally composed canvas has a gap in its \`t=\` windows ` +
                    `(nothing is painted from ${cursor} to ${authored.start} ` +
                    `seconds). Playback skips the gap rather than resting in ` +
                    `silence, and a seek into it lands at the next window's start.`,
            );
        }
        if (!(end > start)) return;

        segments.push({
            start,
            end,
            annotation: authored.placement.annotation,
            alternatives: authored.placement.alternatives,
        });
        cursor = end;
    });

    return {
        duration: canvasDuration ?? segments.at(-1)?.end ?? 0,
        segments,
    };
}

/**
 * Which segment plays a canvas time, and how far into it.
 *
 * A time in a gap resolves to the START of the next window — the gap is skipped
 * rather than waited out — and a time past the last window rests at its end.
 * `null` only when the map has no segments at all.
 */
export function positionAt(
    map: SegmentMap,
    canvasTime: number,
): SegmentPosition | null {
    const { segments } = map;
    if (segments.length === 0) return null;

    const time = Number.isFinite(canvasTime) ? Math.max(canvasTime, 0) : 0;
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (time < segment.start) return { index, offset: 0 };
        if (time < segment.end) return { index, offset: time - segment.start };
    }

    const last = segments.length - 1;
    return { index: last, offset: segments[last].end - segments[last].start };
}

/** The canvas time a segment's element time is at — `positionAt`'s inverse. */
export function canvasTimeAt(
    map: SegmentMap,
    position: SegmentPosition,
): number {
    const segment = map.segments[position.index];
    if (!segment) return 0;
    return Math.min(segment.start + Math.max(position.offset, 0), segment.end);
}
