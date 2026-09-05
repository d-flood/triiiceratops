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

import { asRecord, stringOrNull } from './iiifJson';

/** Which element plays a source. */
export type AvMediaKind = 'video' | 'audio';

/** One playable time-based resource. */
export interface AvSource {
    /** The resource id, as authored — what the media element's `src` becomes. */
    readonly url: string;
    readonly kind: AvMediaKind;
    readonly format: string | null;
    /**
     * The picture in the canvas's rect is this body, shown by the element that
     * plays it. Not the same question as `kind`: a `Sound` body formatted
     * `video/mp4` plays through a `<video>` and paints no picture.
     */
    readonly paintsPicture: boolean;
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
 * What a body IS, in the two senses the stage needs, or `null` if it is not
 * time-based media at all.
 *
 * Answering `null` is the load-bearing half. Core's classifier only decides
 * whether core can PAINT a body, so "not an image" covers transcripts,
 * annotations, datasets — and `text/vtt`, which really does share a painting
 * annotation's body array with the video it captions (`av-video.json`, and the
 * `body: [Choice(videos), Text(vtt)]` shape core's own unwrapping exists for).
 * Treating any non-image body with an id as playable builds `<video
 * src="…vtt">` the moment a curator writes the caption first.
 *
 * The two answers weigh the same two fields in opposite orders, and
 * `0014-accompanyingcanvas` is why: it types its body `Sound` and formats it
 * `video/mp4`.
 *
 * - `kind` — which element will play it. A `<video>` plays a soundtrack while
 *   an `<audio>` cannot show a picture, so a stated media type decides and the
 *   IIIF type is the fallback — which is also what carries the streaming
 *   manifests, whose formats (`application/vnd.apple.mpegurl`) say nothing
 *   about the medium.
 * - `paintsPicture` — whether the picture in the rect is this body's. Here the
 *   IIIF type decides, because it is what states the medium: 0014's picture
 *   stays the accompanying canvas core paints behind the `<video>` decoding
 *   its sound.
 *
 * The canvas's own dimensions answer neither. A duration-only canvas can paint
 * a moving picture — `0015-start` declares no `width`/`height` — and reading
 * the layout off them puts the video behind an audio timeline lane.
 */
function mediaFacts(
    body: Record<string, unknown>,
): Omit<AvSource, 'url'> | null {
    const format = stringOrNull(body.format);
    const type = body.type ?? body['@type'];
    const sound = type === 'Sound' || type === 'dctypes:Sound';
    const video = type === 'Video' || type === 'dctypes:MovingImage';

    const kind: AvMediaKind | null = format?.startsWith('audio/')
        ? 'audio'
        : format?.startsWith('video/')
          ? 'video'
          : sound
            ? 'audio'
            : video
              ? 'video'
              : null;
    if (!kind) return null;

    return {
        kind,
        format,
        paintsPicture: video || (!sound && kind === 'video'),
    };
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

        const facts = mediaFacts(record);
        if (!facts) continue;

        sources.push({ url, ...facts });
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
