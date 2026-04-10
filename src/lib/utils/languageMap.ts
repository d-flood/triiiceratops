/**
 * Shared utility for resolving IIIF language map values.
 *
 * IIIF v3 uses language maps: `{ "en": ["Hello"], "fr": ["Bonjour"] }`
 * Manifesto returns arrays of `{ value, locale/language }` objects.
 * IIIF v2 may use plain strings.
 *
 * This module provides a single resolution strategy used across the viewer.
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

    // v3 language map object: { "en": ["Chapter 1"], "fr": ["Chapitre 1"] }
    if (typeof value === 'object' && !Array.isArray(value)) {
        const map = value as Record<string, unknown>;
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

    // Manifesto-style array: [{ value: "...", locale: "en" }] or plain string array
    if (Array.isArray(value) && value.length > 0) {
        if (typeof value[0] === 'string') return value[0];

        // Array of { value, locale/language } objects
        const items = value as Array<{
            value?: string;
            _value?: string;
            locale?: string;
            _locale?: string;
            language?: string;
        }>;

        const getItemValue = (item?: { value?: string; _value?: string }) =>
            item?.value ?? item?._value;

        const findByLocale = (locale: string) =>
            items.find(
                (x) =>
                    x.locale === locale ||
                    x._locale === locale ||
                    x.language === locale,
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
            (x) => !x.locale && !x._locale && !x.language,
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
 */
export function resolveAllLanguageValues(
    value: unknown,
    preferredLocale?: string,
): string[] {
    if (!value) return [];
    if (typeof value === 'string') return [value];

    // v3 language map
    if (typeof value === 'object' && !Array.isArray(value)) {
        const map = value as Record<string, unknown>;
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
            locale?: string;
            _locale?: string;
            language?: string;
        }>;

        const getItemValue = (item: { value?: string; _value?: string }) =>
            item.value ?? item._value ?? '';

        const filterByLocale = (locale: string) =>
            items
                .filter(
                    (x) =>
                        x.locale === locale ||
                        x._locale === locale ||
                        x.language === locale,
                )
                .map(getItemValue);

        if (preferredLocale) {
            const result = filterByLocale(preferredLocale);
            if (result.length) return result;
        }

        const enResult = filterByLocale('en');
        if (enResult.length) return enResult;

        const noneResult = items
            .filter((x) => !x.locale && !x._locale && !x.language)
            .map(getItemValue);
        if (noneResult.length) return noneResult;

        return items.map(getItemValue);
    }

    return [String(value)];
}
