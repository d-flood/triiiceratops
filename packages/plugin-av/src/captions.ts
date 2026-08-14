/**
 * Canvas → **caption tracks**: the WebVTT resources a canvas offers, in the two
 * shapes real manifests use.
 *
 * 1. A `Text`/`text/vtt` item riding in the painting annotation's body array,
 *    beside the media it captions (`av-video.json`, and the `lunchroom-manners`
 *    shape core's body-array unwrap exists for).
 * 2. A canvas-level annotation with `motivation: supplementing` whose body is a
 *    VTT resource — what both caption cookbook recipes use (0219, 0074) — where
 *    the body may itself be a `Choice` of one track per language (0074).
 *
 * Only `text/vtt` is read. SRT and TTML are not native `<track>` formats and
 * would need a parser and a renderer of our own (SPEC fences them out), and a
 * transcript derived from annotation bodies is a different feature entirely.
 *
 * Embedded annotations only: both caption recipes and both local fixtures carry
 * the supplementing page inline on the canvas, so nothing here fetches. A
 * canvas whose annotation page is an external reference contributes no tracks
 * rather than a promise, which keeps detection synchronous with the scan that
 * claims the canvas.
 */

import {
    getPaintingAnnotations,
    paintingBodyAlternatives,
} from 'triiiceratops';

/** One WebVTT resource a canvas offers, as authored. */
export interface CaptionTrack {
    /** The resource id — what the `<track>`'s `src` becomes, and its identity. */
    readonly url: string;
    /** BCP 47 tag for `srclang`, or `null` when the resource declares none. */
    readonly language: string | null;
    /** The resource's own label, or `null`. Content, so it is never localized. */
    readonly label: string | null;
    /**
     * The painting annotation whose body array carried this track, by index, or
     * `null` for a canvas-level `supplementing` one — which captions the whole
     * canvas rather than one body on it.
     *
     * Only a temporally composed canvas can tell the difference: there, a track
     * authored beside one segment's body may only show during that segment's
     * window. `sources.ts` numbers its placements over the same list.
     */
    readonly annotation: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;
}

function stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * A IIIF language map's first usable string, preferring the resource's own
 * language. The label is authored content — a track called "Sottotitoli" is
 * called that in every locale — so nothing here consults the viewer's.
 */
function labelText(value: unknown, language: string | null): string | null {
    if (typeof value === 'string') return value || null;

    const map = asRecord(value);
    if (!map) return null;

    const keys = Object.keys(map);
    const preferred = language && keys.includes(language) ? language : keys[0];
    if (preferred === undefined) return null;

    const entry = map[preferred];
    if (typeof entry === 'string') return entry || null;
    return Array.isArray(entry) ? stringOrNull(entry[0]) : null;
}

/** Every resource a body could be: itself, its array items, a Choice's alternatives. */
function bodyResources(body: unknown): unknown[] {
    if (Array.isArray(body)) return body.flatMap(bodyResources);

    const record = asRecord(body);
    if (!record) return [];
    if (record.type === 'Choice' && Array.isArray(record.items))
        return record.items.flatMap(bodyResources);
    return [record];
}

/** The VTT track this resource is, or `null`. */
function vttTrack(
    resource: unknown,
    annotation: number | null,
): CaptionTrack | null {
    const record = asRecord(resource);
    if (!record || record.format !== 'text/vtt') return null;

    const url = stringOrNull(record.id) ?? stringOrNull(record['@id']);
    if (!url) return null;

    const language = stringOrNull(record.language);
    return {
        url,
        language,
        label: labelText(record.label, language),
        annotation,
    };
}

/** Every embedded `supplementing` annotation on a canvas. */
function supplementingAnnotations(canvas: Record<string, unknown>): unknown[] {
    const pages = Array.isArray(canvas.annotations) ? canvas.annotations : [];
    return pages.flatMap((page) => {
        const items = asRecord(page)?.items;
        return Array.isArray(items)
            ? items.filter(
                  (item) => asRecord(item)?.motivation === 'supplementing',
              )
            : [];
    });
}

/**
 * The VTT tracks this canvas offers, in manifest order and deduplicated by URL.
 *
 * Deduplicated because the two shapes can name the same file: a curator who
 * writes the track into the painting body array and also supplements the canvas
 * with it means one track, and two `<track>` children for one file would list
 * the same captions twice.
 *
 * The canvas-level shape WINS that collision. `annotation` is what windows a
 * track to one segment of a composed canvas, and a file supplemented onto the
 * canvas captions the whole of it however many bodies also name it — showing
 * it only during one segment's window would hide captions the curator asked
 * for everywhere.
 */
export function captionTracksForCanvas(canvas: unknown): CaptionTrack[] {
    const record = asRecord(canvas);
    if (!record) return [];

    const resources: { resource: unknown; annotation: number | null }[] = [
        ...getPaintingAnnotations(canvas).flatMap((annotation, index) =>
            paintingBodyAlternatives(annotation).map((resource) => ({
                resource,
                annotation: index,
            })),
        ),
        ...supplementingAnnotations(record).flatMap((annotation) =>
            bodyResources(asRecord(annotation)?.body).map((resource) => ({
                resource,
                annotation: null,
            })),
        ),
    ];

    const tracks: CaptionTrack[] = [];
    const seen = new Map<string, number>();
    for (const { resource, annotation } of resources) {
        const track = vttTrack(resource, annotation);
        if (!track) continue;

        const at = seen.get(track.url);
        if (at !== undefined) {
            if (annotation === null)
                tracks[at] = { ...tracks[at], annotation: null };
            continue;
        }
        seen.set(track.url, tracks.length);
        tracks.push(track);
    }
    return tracks;
}
