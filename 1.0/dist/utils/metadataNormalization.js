import { resolveAllLanguageValues, resolveLanguageValue } from './languageMap';
export function resolveHtmlValues(value, locale) {
    return resolveAllLanguageValues(value, locale).join('<br />');
}
export function normalizeIiifLinks(raw, locale) {
    if (!raw) {
        return [];
    }
    const items = Array.isArray(raw) ? raw : [raw];
    return items
        .map((item) => {
        if (typeof item === 'string') {
            return { id: item, label: item };
        }
        const id = item.id || item['@id'] || '';
        const label = resolveLanguageValue(item.label, locale) || item.format || id;
        return {
            id,
            label,
            format: item.format,
        };
    })
        .filter((item) => item.id);
}
export function normalizeMetadataEntries(rawMetadata, locale) {
    if (!rawMetadata) {
        return [];
    }
    return rawMetadata.map((item) => {
        // `metadata` entries are `{label, value}` in both IIIF v2 and v3, so
        // these two raw reads cover both versions.
        const label = item.label
            ? resolveLanguageValue(item.label, locale)
            : '';
        const value = item.value ? resolveHtmlValues(item.value, locale) : '';
        return { label, value };
    });
}
