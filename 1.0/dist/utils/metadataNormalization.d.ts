export type NormalizedLink = {
    id: string;
    label: string;
    format?: string;
};
export type NormalizedMetadataEntry = {
    label: string;
    value: string;
};
export declare function resolveHtmlValues(value: unknown, locale?: string): string;
export declare function normalizeIiifLinks(raw: any, locale?: string): NormalizedLink[];
export declare function normalizeMetadataEntries(rawMetadata: any, locale?: string): NormalizedMetadataEntry[];
