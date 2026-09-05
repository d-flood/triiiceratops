/**
 * Resolves IIIF language-mapped values to display strings.
 *
 * IIIF v3 uses language maps: `{ "en": ["Hello"], "fr": ["Bonjour"] }`.
 * IIIF v2 may use plain strings, a JSON-LD value object, or an array of
 * `{ value, locale/language }` objects.
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
    if (!value) return '';
    if (typeof value === 'string') return value;

    // v2 JSON-LD value object: { "@language": "en", "@value": "Chapter 1" }
    // v3 language map object: { "en": ["Chapter 1"], "fr": ["Chapitre 1"] }
    if (typeof value === 'object' && !Array.isArray(value)) {
        const map = value as Record<string, unknown>;

        if ('@value' in map) {
            const entry = map['@value'];
            if (Array.isArray(entry) && entry.length > 0) {
                return String(entry[0]);
            }
            return entry === undefined ? '' : String(entry);
        }

        const keys = Object.keys(map);

        const tryKey = (key: string): string | undefined => {
            const entry = map[key];
            if (entry === undefined) return undefined;
            if (Array.isArray(entry) && entry.length > 0)
                return String(entry[0]);
            return String(entry);
        };

        if (preferredLocale) {
            const result = tryKey(preferredLocale);
            if (result !== undefined) return result;
        }

        for (const fallback of ['en', 'none']) {
            const result = tryKey(fallback);
            if (result !== undefined) return result;
        }

        if (keys.length > 0) {
            return tryKey(keys[0]) ?? '';
        }

        return '';
    }

    // [{ value: "...", locale: "en" }] or a plain string array.
    if (Array.isArray(value) && value.length > 0) {
        if (typeof value[0] === 'string') return value[0];

        const items = value as Array<{
            value?: string;
            _value?: string;
            '@value'?: string;
            locale?: string;
            _locale?: string;
            language?: string;
            '@language'?: string;
        }>;

        // `@value` / `@language` is the IIIF Presentation 2 JSON-LD spelling —
        // e.g. `[{ "@value": "Bild 6", "@language": "sv" }]`. Omitting it
        // would return '' and fall back to "Canvas N".
        const getItemValue = (item?: {
            value?: string;
            _value?: string;
            '@value'?: string;
        }) => item?.value ?? item?._value ?? item?.['@value'];

        const findByLocale = (locale: string) =>
            items.find(
                (x) =>
                    x.locale === locale ||
                    x._locale === locale ||
                    x.language === locale ||
                    x['@language'] === locale,
            );

        if (preferredLocale) {
            const match = findByLocale(preferredLocale);
            const value = getItemValue(match);
            if (value) return value;
        }

        const enMatch = findByLocale('en');
        {
            const value = getItemValue(enMatch);
            if (value) return value;
        }

        // Unset locale
        const noneMatch = items.find(
            (x) => !x.locale && !x._locale && !x.language && !x['@language'],
        );
        {
            const value = getItemValue(noneMatch);
            if (value) return value;
        }

        // First available
        return getItemValue(items[0]) ?? '';
    }

    return String(value);
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

        const items = value as Array<{
            value?: string;
            _value?: string;
            '@value'?: string;
            locale?: string;
            _locale?: string;
            language?: string;
            '@language'?: string;
        }>;

        // `@value` / `@language` is the IIIF Presentation 2 JSON-LD spelling —
        // e.g. `[{ "@value": "Bild 6", "@language": "sv" }]`. Omitting it
        // would return '' and fall back to "Canvas N".
        const getItemValue = (item: {
            value?: string;
            _value?: string;
            '@value'?: string;
        }) => item.value ?? item._value ?? item['@value'] ?? '';

        const filterByLocale = (locale: string) =>
            items
                .filter(
                    (x) =>
                        x.locale === locale ||
                        x._locale === locale ||
                        x.language === locale ||
                        x['@language'] === locale,
                )
                .map(getItemValue);

        if (preferredLocale) {
            const result = filterByLocale(preferredLocale);
            if (result.length) return result;
        }

        const enResult = filterByLocale('en');
        if (enResult.length) return enResult;

        const noneResult = items
            .filter(
                (x) =>
                    !x.locale && !x._locale && !x.language && !x['@language'],
            )
            .map(getItemValue);
        if (noneResult.length) return noneResult;

        return items.map(getItemValue);
    }

    return [String(value)];
}
