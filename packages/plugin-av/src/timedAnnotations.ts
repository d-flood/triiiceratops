/**
 * Turning a canvas's manifest annotations into the timed entries the panel
 * lists (cookbook 0103).
 *
 * This module is eager and deliberately tiny, exactly as `renderingTranscript.ts`
 * is: the only thing that has to run on every canvas is "does this canvas carry
 * any timed annotation at all", which decides whether the transcript chunk is
 * worth fetching. Nothing here renders anything — that is the chunk's half
 * (`transcript/index.ts`), which is built self-contained and so can neither
 * import core's parser nor learn IIIF vocabulary. That constraint is what makes
 * this a real seam: IIIF JSON in, timed entries out.
 *
 * ## The linkage contract
 *
 * The input is whatever `ViewerState.getAnnotations` returns — the manifest's
 * own commentary (v3 `canvas.annotations`, v2 `otherContent`) merged with the
 * viewer's own user annotations, never the painting annotations in `items[]`.
 * A user annotation reaching a claimed canvas is only theoretical today, since
 * `annotatableCanvasIds` excludes claimed canvases; one that did would be
 * listed on the same terms as any other, which is why no filter is written.
 * Because painting annotations cannot arrive here, `motivation` is
 * never inspected; it may legitimately be a string or an array (0103 spells the
 * annotation's as `["commenting"]` and its body's as `"commenting"`), and
 * filtering on it would only invent ways to drop commentary a publisher meant.
 *
 * An annotation is listed when both halves resolve:
 *
 * - **A time.** The `target` must be a string that `parseIiifTime` reads as a
 *   temporal media fragment. Core's parser rather than a second copy, so the
 *   `?t=157`-is-not-a-fragment distinction cannot drift between them. A
 *   whole-canvas comment has no place in a time-ordered list and is not listed.
 * - **Text.** The first `TextualBody` whose `format` is absent or exactly
 *   `text/plain` and whose `value` holds something other than whitespace,
 *   taking that value trimmed. A blank body is no more listable than a missing
 *   one, so scanning continues past it to the next body.
 *
 * **Any other body is skipped** — HTML, an external resource, an image. This is
 * the same fence `renderingTranscript.ts` puts around a linked transcript's
 * `format`, for the same reason: a body's value is written into `textContent`,
 * and rendering a `text/html` body as markup would mean either shipping a
 * sanitizer into the chunk or trusting manifest strings. Neither is worth it for
 * a case no AV recipe presents, so an unrenderable body yields no entry rather
 * than a guess.
 *
 * Seconds here are **canvas** time and need no offset: a `#t=` fragment targets
 * the canvas, unlike a caption cue whose times are one segment's own.
 */

import { parseIiifTime } from 'triiiceratops';

import { asArray, asRecord, stringOrNull } from './iiifJson';

/** One timed manifest annotation, in canvas time. */
export interface TimedEntry {
    /** The annotation's IRI, or a positional fallback when it declares none. */
    readonly id: string;
    readonly startSeconds: number;
    /** Absent for a target that named only a start. */
    readonly endSeconds?: number;
    readonly text: string;
}

/** The one body format whose bytes this plugin will render as words. */
const PLAIN_TEXT = 'text/plain';

/** The first renderable body's text, or `''` when the annotation has none. */
function bodyText(body: unknown): string {
    for (const candidate of asArray(body)) {
        const record = asRecord(candidate);
        if (!record) continue;
        if (record.type !== 'TextualBody') continue;
        const { format, value } = record;
        if (format !== undefined && format !== PLAIN_TEXT) continue;
        const text = stringOrNull(value)?.trim();
        if (text) return text;
    }
    return '';
}

/**
 * The listable timed annotations among `annotations`, earliest first.
 *
 * Sorted by start with manifest order winning a tie, so reading down the list
 * follows the recording and two comments on the same moment stay in the order
 * their publisher wrote them.
 */
export function timedAnnotationsFor(
    annotations: readonly unknown[],
): TimedEntry[] {
    const entries: TimedEntry[] = [];

    for (const [index, annotation] of annotations.entries()) {
        const record = asRecord(annotation);
        if (!record) continue;

        const target = record.target;
        if (typeof target !== 'string') continue;
        const time = parseIiifTime(target);
        if (!time) continue;

        const text = bodyText(record.body);
        if (!text) continue;

        entries.push({
            id: stringOrNull(record.id) ?? `annotation:${index}`,
            startSeconds: time.seconds,
            ...(time.endSeconds === undefined
                ? {}
                : { endSeconds: time.endSeconds }),
            text,
        });
    }

    return entries.sort((a, b) => a.startSeconds - b.startSeconds);
}
