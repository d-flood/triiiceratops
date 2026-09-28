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

/**
 * Every embedded `supplementing` annotation on a canvas. `motivation` is a
 * string in v3 and an array in v4.
 */
export function supplementingAnnotations(
    canvas: Record<string, unknown>,
): unknown[] {
    return asArray(canvas.annotations).flatMap((page) =>
        asArray(asRecord(page)?.items).filter((item) =>
            asArray(asRecord(item)?.motivation).includes('supplementing'),
        ),
    );
}
