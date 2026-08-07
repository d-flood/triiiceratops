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
export function resolveLanguageValue(value, preferredLocale) {
    if (!value)
        return '';
    if (typeof value === 'string')
        return value;
    // v2 JSON-LD value object: { "@language": "en", "@value": "Chapter 1" }
    // v3 language map object: { "en": ["Chapter 1"], "fr": ["Chapitre 1"] }
    if (typeof value === 'object' && !Array.isArray(value)) {
        const map = value;
        if ('@value' in map) {
            const entry = map['@value'];
            if (Array.isArray(entry) && entry.length > 0) {
                return String(entry[0]);
            }
            return entry === undefined ? '' : String(entry);
        }
        const keys = Object.keys(map);
        const tryKey = (key) => {
            const entry = map[key];
            if (entry === undefined)
                return undefined;
            if (Array.isArray(entry) && entry.length > 0)
                return String(entry[0]);
            return String(entry);
        };
        if (preferredLocale) {
            const result = tryKey(preferredLocale);
            if (result !== undefined)
                return result;
        }
        for (const fallback of ['en', 'none']) {
            const result = tryKey(fallback);
            if (result !== undefined)
                return result;
        }
        if (keys.length > 0) {
            return tryKey(keys[0]) ?? '';
        }
        return '';
    }
    // Manifesto-style array: [{ value: "...", locale: "en" }] or plain string array
    if (Array.isArray(value) && value.length > 0) {
        if (typeof value[0] === 'string')
            return value[0];
        // Array of { value, locale/language } objects
        const items = value;
        // `@value` / `@language` is the IIIF Presentation 2 JSON-LD spelling —
        // e.g. `[{ "@value": "Bild 6", "@language": "sv" }]`. It reaches here
        // now that canvases are raw JSON; `manifesto.js` used to parse it into
        // `_value`/`_locale` first, so omitting it returned '' and every such
        // label silently fell back to "Canvas N".
        const getItemValue = (item) => item?.value ?? item?._value ?? item?.['@value'];
        const findByLocale = (locale) => items.find((x) => x.locale === locale ||
            x._locale === locale ||
            x.language === locale ||
            x['@language'] === locale);
        if (preferredLocale) {
            const match = findByLocale(preferredLocale);
            const value = getItemValue(match);
            if (value)
                return value;
        }
        const enMatch = findByLocale('en');
        {
            const value = getItemValue(enMatch);
            if (value)
                return value;
        }
        // Unset locale
        const noneMatch = items.find((x) => !x.locale && !x._locale && !x.language && !x['@language']);
        {
            const value = getItemValue(noneMatch);
            if (value)
                return value;
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
export function resolveAllLanguageValues(value, preferredLocale) {
    if (!value)
        return [];
    if (typeof value === 'string')
        return [value];
    // v2 JSON-LD value object or v3 language map
    if (typeof value === 'object' && !Array.isArray(value)) {
        const map = value;
        if ('@value' in map) {
            const entry = map['@value'];
            if (Array.isArray(entry))
                return entry.map(String);
            return entry === undefined ? [] : [String(entry)];
        }
        const keys = Object.keys(map);
        const getValues = (key) => {
            const entry = map[key];
            if (entry === undefined)
                return undefined;
            if (Array.isArray(entry))
                return entry.map(String);
            return [String(entry)];
        };
        if (preferredLocale) {
            const result = getValues(preferredLocale);
            if (result)
                return result;
        }
        for (const fallback of ['en', 'none']) {
            const result = getValues(fallback);
            if (result)
                return result;
        }
        if (keys.length > 0) {
            return getValues(keys[0]) ?? [];
        }
        return [];
    }
    // Array
    if (Array.isArray(value) && value.length > 0) {
        if (typeof value[0] === 'string')
            return value;
        const items = value;
        // `@value` / `@language` is the IIIF Presentation 2 JSON-LD spelling —
        // e.g. `[{ "@value": "Bild 6", "@language": "sv" }]`. It reaches here
        // now that canvases are raw JSON; previously `manifesto.js` parsed it
        // into `_value`/`_locale` before this function ever saw it, so omitting
        // it silently returned '' and every such label fell back to "Canvas N".
        const getItemValue = (item) => item.value ?? item._value ?? item['@value'] ?? '';
        const filterByLocale = (locale) => items
            .filter((x) => x.locale === locale ||
            x._locale === locale ||
            x.language === locale ||
            x['@language'] === locale)
            .map(getItemValue);
        if (preferredLocale) {
            const result = filterByLocale(preferredLocale);
            if (result.length)
                return result;
        }
        const enResult = filterByLocale('en');
        if (enResult.length)
            return enResult;
        const noneResult = items
            .filter((x) => !x.locale && !x._locale && !x.language && !x['@language'])
            .map(getItemValue);
        if (noneResult.length)
            return noneResult;
        return items.map(getItemValue);
    }
    return [String(value)];
}
