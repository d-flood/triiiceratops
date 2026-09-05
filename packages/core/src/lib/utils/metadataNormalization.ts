import { getResourceId } from './iiifIds';
import { asArray } from './iiifParsing';
import { resolveAllLanguageValues, resolveLanguageValue } from './languageMap';

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

export type NormalizedProvider = {
    label: string;
    links: NormalizedLink[];
    logos: string[];
};

/**
 * Everything a IIIF resource says about itself, with the v2 and v3 spellings
 * resolved into one shape.
 *
 * Absent fields come back empty rather than undefined, and no field carries a
 * display fallback — "Untitled", "Attribution" and the like are the reader's
 * choice, and depend on the reader's locale. A canvas simply leaves most of
 * these empty; the mapping is the same either way.
 */
export type DescriptiveMetadata = {
    title: string;
    summary: string;
    metadata: NormalizedMetadataEntry[];
    attributionLabel: string;
    attribution: string;
    license: string;
    providers: NormalizedProvider[];
    homepages: NormalizedLink[];
    rendering: NormalizedLink[];
    seeAlso: NormalizedLink[];
};

/**
 * Read a manifest's or canvas's descriptive metadata out of raw IIIF JSON.
 *
 * The version differences this resolves, all of which are real published
 * shapes rather than defensive guesses:
 *
 * - `summary` (v3) / `description` (v2)
 * - `requiredStatement.label`+`.value` (v3) / bare `attribution` (v2, no label)
 * - `rights` (v3) / `license` (v2, which permits several — the first wins, and
 *   a non-URI shape is dropped rather than rendered as `[object Object]`)
 * - `provider.logo` as a string, an object with `id`, or one with `@id`
 *
 * `label`, `metadata`, `homepage`, `rendering` and `seeAlso` are spelled the
 * same in both versions; their *values* differ, which the language-map and link
 * helpers already absorb.
 */
export function normalizeDescriptiveMetadata(
    json: any,
    locale?: string,
): DescriptiveMetadata {
    if (!json) {
        return {
            title: '',
            summary: '',
            metadata: [],
            attributionLabel: '',
            attribution: '',
            license: '',
            providers: [],
            homepages: [],
            rendering: [],
            seeAlso: [],
        };
    }

    const rawLicense = json.rights || json.license;
    const license = Array.isArray(rawLicense) ? rawLicense[0] : rawLicense;
    const statement = json.requiredStatement;

    return {
        title: resolveLanguageValue(json.label, locale),
        summary: resolveLanguageValue(json.summary ?? json.description, locale),
        metadata: normalizeMetadataEntries(json.metadata, locale),
        attributionLabel: statement?.label
            ? resolveLanguageValue(statement.label, locale)
            : '',
        attribution: statement?.value
            ? resolveHtmlValues(statement.value, locale)
            : resolveHtmlValues(json.attribution, locale),
        license: typeof license === 'string' ? license : '',
        providers: asArray(json.provider).map((p: any) => ({
            label: resolveLanguageValue(p.label, locale) || '',
            links: [
                ...normalizeIiifLinks(p.homepage, locale),
                ...normalizeIiifLinks(p.seeAlso, locale),
            ],
            logos: asArray(p.logo)
                .map((logo: any) =>
                    typeof logo === 'string' ? logo : getResourceId(logo),
                )
                .filter((id: string | null): id is string => !!id),
        })),
        homepages: normalizeIiifLinks(json.homepage, locale),
        rendering: normalizeIiifLinks(json.rendering, locale),
        seeAlso: normalizeIiifLinks(json.seeAlso, locale),
    };
}

export function normalizeMetadataEntries(
    rawMetadata: any,
    locale?: string,
): NormalizedMetadataEntry[] {
    if (!rawMetadata || !Array.isArray(rawMetadata)) {
        return [];
    }

    return rawMetadata.map((item: any) => {
        // `metadata` entries are `{label, value}` in both IIIF v2 and v3, so
        // these two raw reads cover both versions.
        const label = item.label
            ? resolveLanguageValue(item.label, locale)
            : '';

        const value = item.value ? resolveHtmlValues(item.value, locale) : '';

        return { label, value };
    });
}
