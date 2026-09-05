/**
 * Finding a canvas's waveform data, and loading the code that can read it.
 *
 * This module is eager and deliberately tiny: it is the half that has to run on
 * every canvas in order to decide whether the waveform chunk is worth fetching
 * at all. Nothing here parses or draws anything — the moment it did, the chunk
 * would stop being on-demand.
 *
 * ## The linkage contract
 *
 * Waveform data is linked from the CANVAS, in `seeAlso` first and then
 * `rendering`, in manifest order within each. An entry with a string `id` is
 * waveform data when EITHER:
 *
 * 1. its `profile` is the BBC waveform profile
 *    (`http(s)://waveform.prototyping.bbc.co.uk`, with or without a trailing
 *    slash) — the British Library's signal; or
 * 2. the word "waveform" appears in its `label` (any language, any value) or in
 *    the last path segment of its `id` — Avalon's signal, whose entry carries no
 *    profile at all and whose file really is called `waveform.json`.
 *
 * The first matching entry wins and the rest are ignored.
 *
 * **`format` is never consulted**, here or when the bytes are read. The three
 * shapes that exist in the wild disagree about it and two of them are wrong
 * about their own payload: Avalon says `application/json` (correct), the British
 * Library says `application/octet-stream` for a `.dat` (correct but useless —
 * so does every unrelated binary), and a `.dat` served as `application/json` is
 * the observed misconfiguration the sniffing order in `waveform/peaks.ts` exists
 * to survive. A rule that trusted `format` would either adopt every transcript
 * on the canvas or reject a real waveform, so it trusts the words instead and
 * lets the parser have the last word on the bytes.
 *
 * This rule is why `0017-transcription-av`'s `rendering` — a `text/plain`
 * transcript — is not adopted: no profile, no "waveform" anywhere in it.
 */

import { asArray, asRecord, labelStrings } from './iiifJson';
import type { Peaks } from './waveform/peaks';

const BBC_WAVEFORM_PROFILE =
    /^https?:\/\/waveform\.prototyping\.bbc\.co\.uk\/?$/;

function saysWaveform(entry: Record<string, unknown>, id: string): boolean {
    if (labelStrings(entry.label).some((text) => /waveform/i.test(text)))
        return true;
    const path = id.split(/[?#]/, 1)[0];
    return /waveform/i.test(path.slice(path.lastIndexOf('/') + 1));
}

/** The URL of this canvas's waveform data, or `null` if it links none. */
export function waveformUrlFor(canvas: unknown): string | null {
    const record = asRecord(canvas);
    if (!record) return null;

    for (const entry of [
        ...asArray(record.seeAlso),
        ...asArray(record.rendering),
    ]) {
        const linked = asRecord(entry);
        const id = linked?.id ?? linked?.['@id'];
        if (!linked || typeof id !== 'string' || id === '') continue;

        const profile = linked.profile;
        if (
            (typeof profile === 'string' &&
                BBC_WAVEFORM_PROFILE.test(profile)) ||
            saysWaveform(linked, id)
        )
            return id;
    }

    return null;
}

/** The waveform chunk's public shape, as the eager side uses it. */
export type WaveformModule = typeof import('./waveform/index');

/**
 * Load the waveform chunk and resolve this URL's peaks, or `null`.
 *
 * The `await import()` is the whole point of the module: it is what keeps every
 * byte of parsing and rendering out of the entry, so a page of image-only
 * manifests never requests them. It must stay dynamic — a static import
 * anywhere in the eager graph silently undoes it.
 *
 * A chunk that will not load (offline, a CSP that blocks it) is the same
 * non-event as data that will not parse: no waveform, and the lane keeps
 * working.
 */
export async function loadPeaks(
    url: string,
): Promise<{ module: WaveformModule; peaks: Peaks } | null> {
    try {
        const module = await import('./waveform/index');
        const peaks = await module.fetchPeaks(url);
        return peaks ? { module, peaks } : null;
    } catch {
        return null;
    }
}
