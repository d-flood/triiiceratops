/**
 * Resolves IIIF language-mapped values to display strings.
 *
 * IIIF v3 uses language maps: `{ "en": ["Hello"], "fr": ["Bonjour"] }`.
 * IIIF v2 may use plain strings, a JSON-LD value object, or an array of
 * `{ "@value", "@language" }` objects.
 */

/**
 * Resolve a IIIF language-mapped value to a single display string.
 *
 * Precedence: preferredLocale → 'en' → 'none'/unset → first available.
 */
export function resolveLanguageValue(
    value: unknown,
    preferredLocale?: string,
): string {
    return resolveAllLanguageValues(value, preferredLocale).find(Boolean) ?? '';
}

/**
 * Resolve a IIIF language-mapped value to all display strings
 * (for multi-value properties like metadata values with multiple entries
 * in a single language).
 *
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export function resolveAllLanguageValues(
    value: unknown,
    preferredLocale?: string,
): string[] {
    if (!value) return [];
    if (typeof value === 'string') return [value];

    // v2 JSON-LD value object or v3 language map
    if (typeof value === 'object' && !Array.isArray(value)) {
        const map = value as Record<string, unknown>;

        if ('@value' in map) {
            const entry = map['@value'];
            if (Array.isArray(entry)) return entry.map(String);
            return entry === undefined ? [] : [String(entry)];
        }

        const keys = Object.keys(map);

        const getValues = (key: string): string[] | undefined => {
            const entry = map[key];
            if (entry === undefined) return undefined;
            if (Array.isArray(entry)) return entry.map(String);
            return [String(entry)];
        };

        if (preferredLocale) {
            const result = getValues(preferredLocale);
            if (result) return result;
        }

        for (const fallback of ['en', 'none']) {
            const result = getValues(fallback);
            if (result) return result;
        }

        if (keys.length > 0) {
            return getValues(keys[0]) ?? [];
        }

        return [];
    }

    // Array
    if (Array.isArray(value) && value.length > 0) {
        if (typeof value[0] === 'string') return value as string[];

        // `@value` / `@language` is the IIIF Presentation 2 JSON-LD spelling —
        // e.g. `[{ "@value": "Bild 6", "@language": "sv" }]` — and the only one
        // this shape has. It is what `vendored/riksarkivetscblarge.json` labels
        // every canvas with; omitting it would return '' and fall back to
        // "Canvas N".
        const items = value as Array<{
            '@value'?: string;
            '@language'?: string;
        }>;

        const filterByLocale = (locale: string) =>
            items
                .filter((x) => x['@language'] === locale)
                .map((x) => x['@value'] ?? '');

        if (preferredLocale) {
            const result = filterByLocale(preferredLocale);
            if (result.length) return result;
        }

        const enResult = filterByLocale('en');
        if (enResult.length) return enResult;

        const noneResult = items
            .filter((x) => !x['@language'])
            .map((x) => x['@value'] ?? '');
        if (noneResult.length) return noneResult;

        return items.map((x) => x['@value'] ?? '');
    }

    return [String(value)];
}
