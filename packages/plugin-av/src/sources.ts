/**
 * Canvas → **source provider**: which time-based bodies a canvas paints, and
 * which of them this release plays.
 *
 * A canvas maps to a provider, never to "the one body": `0064-opera-one-canvas`
 * tiles a single canvas's duration with two videos, and the sequencer plays such
 * a canvas through as one work. Everything here reports every placement it found
 * and marks the canvas composed; what the placements MEAN on the canvas timeline
 * is the sequencer's to decide, out of the `t=` fragment carried here unparsed.
 *
 * What a body *is* is never decided here. `isImageBody` and
 * `paintingBodyAlternatives` are core's own painting classifier, exported for
 * exactly this caller, and a second implementation of that rule is the drift
 * this seam exists to prevent.
 */

import {
    getPaintingAnnotations,
    isImageBody,
    paintingBodyAlternatives,
} from 'triiiceratops';

/** Which element plays a source. */
export type AvMediaKind = 'video' | 'audio';

/** One playable time-based resource. */
export interface AvSource {
    /** The resource id, as authored — what the media element's `src` becomes. */
    readonly url: string;
    readonly kind: AvMediaKind;
    readonly format: string | null;
}

/** One painting annotation that places a time-based body on the canvas. */
export interface AvPlacement {
    /**
     * This annotation's index among the canvas's painting annotations. It is
     * how a segment finds the caption tracks authored beside its own body:
     * `captionTracksForCanvas` numbers tracks over the same list.
     */
    readonly annotation: number;
    /**
     * The target's media fragment, as authored and unparsed (`''` when there is
     * none). The sequencer reads the `t=` window out of it to build the segment
     * map; nothing else looks inside it.
     */
    readonly fragment: string;
    /**
     * Every time-based resource this annotation could place, in manifest order
     * — one entry unless a `Choice` offers renditions. Which of them is
     * attached is `formats.ts`' decision and depends on the browser, so it is
     * deliberately not made here: parsing must answer the same way whoever
     * asks.
     */
    readonly alternatives: readonly AvSource[];
    /** The annotation's target carries a `t=` media fragment. */
    readonly temporal: boolean;
    /** The annotation's target carries an `xywh=` media fragment. */
    readonly spatial: boolean;
}

/** What one canvas paints in time-based media. */
export interface AvCanvasScan {
    readonly canvasId: string;
    /** Declared canvas dimensions, or `null` for a duration-only canvas. */
    readonly width: number | null;
    readonly height: number | null;
    /**
     * The canvas's declared duration in seconds, or `null` when it declares
     * none. This is the canvas timeline's length, which a media element only
     * agrees with once `loadedmetadata` has fired — so it is what gives a
     * scrubber a range to draw before a byte of media has arrived.
     */
    readonly duration: number | null;
    /** Every time-based placement, in manifest order. */
    readonly placements: readonly AvPlacement[];
    /**
     * Several bodies share this canvas's duration, so the canvas timeline is a
     * segment map rather than the identity mapping and a sequencer plays it.
     */
    readonly temporallyComposed: boolean;
    /** At least one time-based body is placed into part of the canvas rect. */
    readonly spatiallyTargeted: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;
}

function stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

function usableDimension(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : null;
}

/**
 * The media fragment on a painting annotation's target, or `''`.
 *
 * Two spellings reach here: the string target every vendored recipe uses
 * (`…/canvas#xywh=…&t=…`) and the `SpecificResource` + `FragmentSelector` form
 * IIIF also permits. It is returned unparsed: the `xywh=` half really is ignored
 * (the degradation warning says so), and the `t=` half is only read by the
 * sequencer, which is lazily loaded and must not pull a parser into the entry.
 */
function targetFragment(target: unknown): string {
    if (typeof target === 'string') {
        const hash = target.indexOf('#');
        return hash === -1 ? '' : target.slice(hash + 1);
    }

    const record = asRecord(target);
    if (!record) return '';

    const selector = asRecord(record.selector);
    return stringOrNull(selector?.value) ?? '';
}

/**
 * Which element a body plays in, or `null` if it is not time-based media at all.
 *
 * Answering `null` is the load-bearing half. Core's classifier only decides
 * whether core can PAINT a body, so "not an image" covers transcripts,
 * annotations, datasets — and `text/vtt`, which really does share a painting
 * annotation's body array with the video it captions (`av-video.json`, and the
 * `body: [Choice(videos), Text(vtt)]` shape core's own unwrapping exists for).
 * Treating any non-image body with an id as playable builds `<video
 * src="…vtt">` the moment a curator writes the caption first.
 *
 * The `type` is the weaker signal: `0014-accompanyingcanvas` types its body
 * `Sound` and formats it `video/mp4`, and a `<video>` plays a soundtrack while
 * an `<audio>` cannot show a picture. So a stated media type decides, and the
 * IIIF type is the fallback — which is also what carries the streaming
 * manifests, whose formats (`application/vnd.apple.mpegurl`) say nothing about
 * the medium.
 */
function mediaKind(body: Record<string, unknown>): AvMediaKind | null {
    const format = stringOrNull(body.format);
    if (format?.startsWith('audio/')) return 'audio';
    if (format?.startsWith('video/')) return 'video';

    const type = body.type ?? body['@type'];
    if (type === 'Sound' || type === 'dctypes:Sound') return 'audio';
    if (type === 'Video' || type === 'dctypes:MovingImage') return 'video';

    return null;
}

/**
 * Every time-based body this annotation could place, in manifest order.
 *
 * A Choice contributes all of its alternatives, flattened by core's own
 * unwrapping — the same list the reader is being offered a pick from.
 *
 * Only the time-based ones: the alternatives arrive in manifest order, and a
 * caption track sharing the body array with its video must be skipped rather
 * than played (the `body: [Choice(videos), Text(vtt)]` shape).
 */
function placedSources(annotation: unknown): AvSource[] {
    const sources: AvSource[] = [];

    for (const body of paintingBodyAlternatives(annotation)) {
        if (isImageBody(body)) continue;

        const record = asRecord(body);
        const url = stringOrNull(record?.id) ?? stringOrNull(record?.['@id']);
        if (!record || !url) continue;

        const kind = mediaKind(record);
        if (!kind) continue;

        sources.push({ url, kind, format: stringOrNull(record.format) });
    }

    return sources;
}

/**
 * What this canvas paints in time-based media, or `null` if it paints none.
 *
 * Answering for EVERY canvas rather than only claimable ones is deliberate: a
 * canvas with an image body beside a video one is core's to paint and this
 * plugin's to warn about (`0489-multimedia-canvas`), so the degradation contract
 * needs the scan even where no stage will be built.
 */
export function scanCanvasForAv(canvas: unknown): AvCanvasScan | null {
    const record = asRecord(canvas);
    const canvasId =
        stringOrNull(record?.id) ?? stringOrNull(record?.['@id']) ?? null;
    if (!record || !canvasId) return null;

    const placements: AvPlacement[] = [];
    getPaintingAnnotations(canvas).forEach((annotation, index) => {
        const alternatives = placedSources(annotation);
        if (alternatives.length === 0) return;

        const fragment = targetFragment(asRecord(annotation)?.target);
        placements.push({
            annotation: index,
            fragment,
            alternatives,
            temporal: /(^|&)t=/.test(fragment),
            spatial: /(^|&)xywh=/.test(fragment),
        });
    });

    if (placements.length === 0) return null;

    return {
        canvasId,
        width: usableDimension(record.width),
        height: usableDimension(record.height),
        duration: usableDimension(record.duration),
        placements,
        temporallyComposed: placements.length > 1,
        spatiallyTargeted: placements.some((placement) => placement.spatial),
    };
}
