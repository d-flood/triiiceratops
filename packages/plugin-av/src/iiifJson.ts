/**
 * The narrow JSON-shape readers the eager manifest scanners share.
 *
 * Every scanner in the entry — `sources.ts`, `captions.ts`, `waveformLink.ts`,
 * `renderingTranscript.ts` — walks untyped manifest JSON and needs the same
 * three or four guards to do it. Rollup does not dedupe identical function
 * bodies across modules, so a copy per scanner is a copy in the bundle.
 *
 * Deliberately not core's IIIF helpers: the IIFE reads only four curated
 * functions off `window.Triiiceratops.core` (see `sharedRuntimeGate.ts`), and
 * widening that namespace to publish guards this small would cost core more than
 * it saves here.
 */

/**
 * `value` as an indexable object, or `null` for a primitive or `null`.
 *
 * Arrays are not excluded: an array is indexable, and reading a named IIIF
 * property off one yields `undefined` — the same answer a caller gets from a
 * nulled record — so no caller needs a check of its own.
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;
}

/**
 * `value` as an array, wrapping the many IIIF properties that may be authored
 * either as one value or as a list. Absent becomes empty, not `[undefined]`.
 */
export function asArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    return value === undefined || value === null ? [] : [value];
}

/** `value` as a non-empty string, or `null` — an authored `''` is not a value. */
export function stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

/** Every string inside an IIIF language map (or a bare string label). */
export function labelStrings(label: unknown): string[] {
    if (typeof label === 'string') return [label];
    const record = asRecord(label);
    if (!record) return [];
    return Object.values(record)
        .flatMap((values) => asArray(values))
        .filter((value): value is string => typeof value === 'string');
}

/**
 * The first non-blank string in an IIIF language map, trimmed, or `''`.
 *
 * Language-indifferent on purpose: it names a single linked resource, so there
 * is no set of candidates to choose the reader's language from — picking "the
 * wrong language's name for the only one there is" is not a failure mode that
 * exists. What matters is that a name authored under any language tag is used
 * rather than discarded.
 */
export function firstLabel(label: unknown): string {
    for (const value of labelStrings(label)) {
        const text = value.trim();
        if (text) return text;
    }
    return '';
}
