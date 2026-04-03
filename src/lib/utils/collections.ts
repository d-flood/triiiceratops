/**
 * Utility for parsing IIIF Collections.
 *
 * A IIIF Collection (v3) has `type: "Collection"` and an `items` array
 * containing Manifests and/or child Collections.
 *
 * A IIIF Collection (v2) has `@type: "sc:Collection"` and `manifests`
 * and/or `collections` arrays.
 */

export interface CollectionItem {
    /** The manifest or collection id (URI) */
    id: string;
    /** 'Manifest' or 'Collection' */
    type: 'Manifest' | 'Collection';
    /** Human-readable label */
    label: string;
    /** Optional thumbnail URL */
    thumbnail?: string;
}

/**
 * Resolve a IIIF label value to a plain string.
 */
function resolveLabel(label: any): string {
    if (!label) return '';
    if (typeof label === 'string') return label;

    // v3 language map
    if (typeof label === 'object' && !Array.isArray(label)) {
        const langs = Object.keys(label);
        const preferred = ['en', 'none'];
        for (const lang of preferred) {
            if (label[lang]) {
                const values = label[lang];
                return Array.isArray(values) ? values[0] : String(values);
            }
        }
        if (langs.length > 0) {
            const values = label[langs[0]];
            return Array.isArray(values) ? values[0] : String(values);
        }
    }

    // Array of language value objects
    if (Array.isArray(label) && label.length > 0) {
        if (typeof label[0] === 'string') return label[0];
        if (label[0].value) return label[0].value;
    }

    return String(label);
}

/**
 * Extract a thumbnail URL from an item's thumbnail property.
 */
function extractThumbnail(item: any): string | undefined {
    if (!item.thumbnail) return undefined;

    const thumbs = Array.isArray(item.thumbnail)
        ? item.thumbnail
        : [item.thumbnail];

    for (const t of thumbs) {
        if (typeof t === 'string') return t;
        if (t.id) return t.id;
        if (t['@id']) return t['@id'];
    }

    return undefined;
}

/**
 * Determine if a JSON resource is a IIIF Collection.
 */
export function isCollection(json: any): boolean {
    if (!json) return false;
    const type = json.type || json['@type'];
    return type === 'Collection' || type === 'sc:Collection';
}

/**
 * Get the label of a collection from its JSON.
 */
export function getCollectionLabel(json: any): string {
    return resolveLabel(json?.label) || 'Collection';
}

/**
 * Parse a IIIF Collection JSON into a list of items.
 * Supports both v2 and v3 formats.
 */
export function parseCollection(json: any): CollectionItem[] {
    if (!json) return [];

    const items: CollectionItem[] = [];

    // IIIF v3: items array
    if (Array.isArray(json.items)) {
        for (const item of json.items) {
            const type = item.type || item['@type'];
            if (type === 'Manifest' || type === 'Collection') {
                items.push({
                    id: item.id || item['@id'] || '',
                    type: type === 'Collection' ? 'Collection' : 'Manifest',
                    label: resolveLabel(item.label),
                    thumbnail: extractThumbnail(item),
                });
            }
        }
    }

    // IIIF v2: manifests and collections arrays
    if (Array.isArray(json.manifests)) {
        for (const item of json.manifests) {
            items.push({
                id: item['@id'] || item.id || '',
                type: 'Manifest',
                label: resolveLabel(item.label),
                thumbnail: extractThumbnail(item),
            });
        }
    }

    if (Array.isArray(json.collections)) {
        for (const item of json.collections) {
            items.push({
                id: item['@id'] || item.id || '',
                type: 'Collection',
                label: resolveLabel(item.label),
                thumbnail: extractThumbnail(item),
            });
        }
    }

    // IIIF v2: members array (mixed manifests and collections)
    if (Array.isArray(json.members)) {
        for (const item of json.members) {
            const type = item['@type'] || item.type;
            if (
                type === 'sc:Manifest' ||
                type === 'Manifest' ||
                type === 'sc:Collection' ||
                type === 'Collection'
            ) {
                items.push({
                    id: item['@id'] || item.id || '',
                    type:
                        type === 'sc:Collection' || type === 'Collection'
                            ? 'Collection'
                            : 'Manifest',
                    label: resolveLabel(item.label),
                    thumbnail: extractThumbnail(item),
                });
            }
        }
    }

    return items;
}
