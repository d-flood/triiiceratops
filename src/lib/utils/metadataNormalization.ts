import {
    resolveAllLanguageValues,
    resolveLanguageValue,
} from './languageMap';

export type NormalizedLink = {
    id: string;
    label: string;
    format?: string;
};

export type NormalizedMetadataEntry = {
    label: string;
    value: string;
};

export function resolveHtmlValues(value: unknown, locale?: string): string {
    return resolveAllLanguageValues(value, locale).join('<br />');
}

export function normalizeIiifLinks(
    raw: any,
    locale?: string,
): NormalizedLink[] {
    if (!raw) {
        return [];
    }

    const items = Array.isArray(raw) ? raw : [raw];

    return items
        .map((item: any) => {
            if (typeof item === 'string') {
                return { id: item, label: item };
            }

            const id = item.id || item['@id'] || '';
            const label =
                resolveLanguageValue(item.label, locale) || item.format || id;

            return {
                id,
                label,
                format: item.format,
            };
        })
        .filter((item) => item.id);
}

export function normalizeMetadataEntries(
    rawMetadata: any,
    locale?: string,
): NormalizedMetadataEntry[] {
    if (!rawMetadata) {
        return [];
    }

    return rawMetadata.map((item: any) => {
        const source = item?.__jsonld || item;

        const label = source.label
            ? resolveLanguageValue(source.label, locale)
            : item.getLabel
              ? resolveLanguageValue(item.getLabel(), locale)
              : '';

        const value = source.value
            ? resolveHtmlValues(source.value, locale)
            : item.getValue
              ? resolveHtmlValues(item.getValue(), locale)
              : '';

        return { label, value };
    });
}
