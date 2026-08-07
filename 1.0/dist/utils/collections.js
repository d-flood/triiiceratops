/**
 * Utility for parsing IIIF Collections.
 *
 * A IIIF Collection (v3) has `type: "Collection"` and an `items` array
 * containing Manifests and/or child Collections.
 *
 * A IIIF Collection (v2) has `@type: "sc:Collection"` and `manifests`
 * and/or `collections` arrays.
 */
import { resolveLanguageValue } from './languageMap';
import { resolveThumbnailResourceSrc } from './getThumbnailSrc';
/** Resolve a IIIF label value to a plain string. */
function resolveLabel(label) {
    return resolveLanguageValue(label);
}
/**
 * Extract a thumbnail URL from an item's thumbnail property.
 */
function extractThumbnail(item) {
    if (!item.thumbnail)
        return undefined;
    return resolveThumbnailResourceSrc(item.thumbnail) || undefined;
}
function extractNavDate(item) {
    const navDate = item?.navDate;
    return typeof navDate === 'string' && navDate ? navDate : undefined;
}
/**
 * Determine if a JSON resource is a IIIF Collection.
 */
export function isCollection(json) {
    if (!json)
        return false;
    const type = json.type || json['@type'];
    return type === 'Collection' || type === 'sc:Collection';
}
/**
 * Get the label of a collection from its JSON.
 */
export function getCollectionLabel(json) {
    return resolveLabel(json?.label) || 'Collection';
}
/**
 * Get the thumbnail of a collection from its JSON.
 */
export function getCollectionThumbnail(json) {
    return extractThumbnail(json);
}
/**
 * Parse a IIIF Collection JSON into a list of items.
 * Supports both v2 and v3 formats.
 */
export function parseCollection(json) {
    if (!json)
        return [];
    const items = [];
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
                    navDate: extractNavDate(item),
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
                navDate: extractNavDate(item),
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
                navDate: extractNavDate(item),
            });
        }
    }
    // IIIF v2: members array (mixed manifests and collections)
    if (Array.isArray(json.members)) {
        for (const item of json.members) {
            const type = item['@type'] || item.type;
            if (type === 'sc:Manifest' ||
                type === 'Manifest' ||
                type === 'sc:Collection' ||
                type === 'Collection') {
                items.push({
                    id: item['@id'] || item.id || '',
                    type: type === 'sc:Collection' || type === 'Collection'
                        ? 'Collection'
                        : 'Manifest',
                    label: resolveLabel(item.label),
                    thumbnail: extractThumbnail(item),
                    navDate: extractNavDate(item),
                });
            }
        }
    }
    return items;
}
/**
 * Return collection items in chronology-aware navigation order.
 */
export function sortCollectionItems(items) {
    return [...items].sort((a, b) => {
        if (a.navDate && b.navDate) {
            const dateCompare = a.navDate.localeCompare(b.navDate);
            if (dateCompare !== 0)
                return dateCompare;
        }
        else if (a.navDate) {
            return -1;
        }
        else if (b.navDate) {
            return 1;
        }
        const labelCompare = a.label.localeCompare(b.label);
        if (labelCompare !== 0)
            return labelCompare;
        return a.id.localeCompare(b.id);
    });
}
