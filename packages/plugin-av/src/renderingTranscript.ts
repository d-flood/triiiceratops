/**
 * Finding the untimed transcript a canvas links as an alternate representation.
 *
 * This module is eager and deliberately tiny, exactly as `waveformLink.ts` and
 * `transcriptLink.ts` are: the only thing that has to run on every canvas is
 * "does this canvas link a transcript file at all", which decides whether the
 * transcript chunk is worth fetching. Nothing here fetches or renders the
 * transcript — that is the chunk's half (`transcript/index.ts`).
 *
 * ## The linkage contract
 *
 * The IIIF transcript meta-recipe (cookbook 0231) gives a publisher three ways
 * to attach a transcript, and they are not interchangeable. Timed text belongs
 * on a `supplementing` annotation, which arrives here as a caption track and
 * drives the cue list; this module covers the other one — a whole transcript as
 * ONE file, linked from the canvas's `rendering` as an alternate representation
 * of the recording (cookbook 0017).
 *
 * Only `rendering` is scanned. `seeAlso` is for machine-readable descriptions of
 * the resource (cookbook 0053) — a schema.org document, an ALTO file, a MARC
 * record — and adopting one as a transcript would put a metadata payload in a
 * panel a reader opened to read words that were spoken.
 *
 * The first entry with a string `id` and a `text/plain` format wins and the rest
 * are ignored.
 *
 * **`format` IS trusted here**, which is the opposite of `waveformLink.ts`'s
 * rule, and the difference is what the two do with the bytes. A waveform is
 * handed to a parser that can sniff its own payload and reject it, so a wrong
 * `format` costs nothing; a transcript is written into `textContent`, where the
 * only thing standing between a reader and a screenful of binary is the
 * publisher's declaration that the file is text. `text/plain` is the sole
 * declaration this plugin can honour, so a transcript in PDF, HTML or TEI is
 * deliberately NOT adopted: each needs parsing or sanitizing this bundle does
 * not carry, and rendering one raw would be worse than not offering it. Core's
 * metadata panel already lists a manifest's `rendering` entries as links, so
 * those transcripts remain reachable — just not readable in place.
 */

import { asArray, asRecord, firstLabel } from './iiifJson';

/** An untimed transcript linked from a canvas. */
export interface TextTranscript {
    /** Where the transcript's bytes are. */
    readonly url: string;
    /**
     * The publisher's own name for it, or `''` where the entry declared none.
     * The panel supplies its own generic name for the empty case, because only
     * it knows the active locale.
     */
    readonly label: string;
}

/** The one format whose bytes this plugin will render as words. */
const PLAIN_TEXT = 'text/plain';

/** The untimed transcript this canvas links, or `null` if it links none. */
export function textTranscriptFor(canvas: unknown): TextTranscript | null {
    const record = asRecord(canvas);
    if (!record) return null;

    for (const candidate of asArray(record.rendering)) {
        const entry = asRecord(candidate);
        if (!entry) continue;
        const { id, format } = entry;
        if (typeof id !== 'string' || !id) continue;
        // Compared case-insensitively and without parameters: `Text/Plain` and
        // `text/plain; charset=utf-8` are the same declaration, and a publisher
        // who wrote either meant this file is text.
        if (typeof format !== 'string') continue;
        if (format.split(';')[0].trim().toLowerCase() !== PLAIN_TEXT) continue;
        return { url: id, label: firstLabel(entry.label) };
    }
    return null;
}
