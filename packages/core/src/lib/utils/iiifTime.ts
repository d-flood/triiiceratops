/**
 * A `#t=` media fragment's span, in seconds. `endSeconds` is absent when the
 * fragment names only a start.
 *
 * This rides on `ViewerState.setCanvas` and `ContentStateTarget`, so it is a
 * public type. `parseIiifTime` is public because a first-party claimant needs
 * it; the rest of `iiifTargets` remains internal because publishing it would
 * drag target normalization, selectors, and `xywh=` into the API contract.
 */
export type IiifTemporalFragment = {
    seconds: number;
    endSeconds?: number;
};

/**
 * The fragment component of a target, or `''` when it has none. A value with
 * no `#` is treated as a bare fragment (`t=157`, `xywh=...&t=...`) unless it
 * carries a query string, which only a full URI can — and a query is never
 * fragment content.
 */
function getFragmentComponent(value: string): string {
    const hashIndex = value.indexOf('#');
    if (hashIndex !== -1) return value.slice(hashIndex + 1);
    return value.includes('?') ? '' : value;
}

/**
 * One bound of a `t=` dimension in seconds, or `null` when it is absent or in
 * a form this parser does not read.
 */
function parseNptSeconds(raw: string): number | null {
    const digits = raw.startsWith('npt:') ? raw.slice(4) : raw;
    // Rejects the `hh:mm:ss` spelling, signs, whitespace and `Infinity`;
    // `Number` then rejects the multi-dot leftovers (`.`, `..`, `1.2.3`).
    if (!/^[\d.]+$/.test(digits)) return null;
    const seconds = Number(digits);
    return Number.isFinite(seconds) ? seconds : null;
}

/**
 * Parse the temporal dimension of a media fragment (`#t=157`, `#t=157,203`,
 * `#t=,203`), the time counterpart of an IIIF `xywh` fragment.
 *
 * Only Normal Play Time in plain seconds is read — the form every IIIF
 * Cookbook recipe uses — with an explicit `npt:` prefix accepted and ignored
 * on either bound. NPT's `hh:mm:ss` spelling is valid Media Fragments but is
 * not parsed: it yields `null` rather than a wrong number of seconds. Only the
 * fragment component is inspected, so a `t=` in a query string (`?t=157`,
 * `?foo=1&t=157`) is never mistaken for a media fragment.
 */
export function parseIiifTime(value: string): IiifTemporalFragment | null {
    if (!value) return null;

    const match = getFragmentComponent(value).match(/(?:^|&)t=([^&]*)/);
    if (!match) return null;

    const bounds = match[1].split(',');
    if (bounds.length > 2) return null;

    const start = parseNptSeconds(bounds[0]);
    const end = bounds.length === 2 ? parseNptSeconds(bounds[1]) : null;

    // Media Fragments defaults an omitted start to the beginning of the media,
    // but an unreadable one is garbage rather than an omission.
    if (start === null && bounds[0] !== '') return null;
    if (start === null && end === null) return null;

    const seconds = start ?? 0;
    // endSeconds is carried, never validated against the start (spec fence).
    return end === null ? { seconds } : { seconds, endSeconds: end };
}
