/**
 * Utility for parsing IIIF Collections.
 *
 * A IIIF Collection (v3) has `type: "Collection"` and an `items` array
 * containing Manifests and/or child Collections.
 *
 * A IIIF Collection (v2) has `@type: "sc:Collection"` and `manifests`
 * and/or `collections` arrays.
 */

import { getResourceId } from './iiifIds';
import { resolveLanguageValue } from './languageMap';
import { resolveThumbnailResourceSrc } from './getThumbnailSrc';

export interface CollectionItem {
    /** The manifest or collection id (URI) */
    id: string;
    /** 'Manifest' or 'Collection' */
    type: 'Manifest' | 'Collection';
    /** Human-readable label */
    label: string;
    /** Optional thumbnail URL */
    thumbnail?: string;
    /** Optional navDate (ISO 8601) for chronological navigation */
    navDate?: string;
}

/**
 * A v2 member's id, `@id` first.
 *
 * The canonical spelling differs by version, so a hybrid document carrying a
 * local `id` beside a canonical `@id` must resolve to the one the block it sits
 * in is written in — and these three fields (`manifests`, `collections`,
 * `members`) are the v2 ones.
 */
function v2MemberId(item: any): string | null {
    return item?.['@id'] || getResourceId(item);
}

/**
 * Extract a thumbnail URL from an item's thumbnail property.
 */
function extractThumbnail(item: any): string | undefined {
    if (!item.thumbnail) return undefined;

    return resolveThumbnailResourceSrc(item.thumbnail) || undefined;
}

function extractNavDate(item: any): string | undefined {
    const navDate = item?.navDate;
    return typeof navDate === 'string' && navDate ? navDate : undefined;
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
    return resolveLanguageValue(json?.label) || 'Collection';
}

/**
 * Get the thumbnail of a collection from its JSON.
 */
export function getCollectionThumbnail(json: any): string | undefined {
    return extractThumbnail(json);
}

/**
 * A member's declared type as one of this module's two values, reading both
 * IIIF versions' spellings. `null` for anything else: a Collection may list
 * resources the navigation cannot open, and those are skipped.
 */
function resolveItemType(item: any): CollectionItem['type'] | null {
    const type = item?.type || item?.['@type'];
    if (type === 'Collection' || type === 'sc:Collection') return 'Collection';
    if (type === 'Manifest' || type === 'sc:Manifest') return 'Manifest';
    return null;
}

/**
 * Parse a IIIF Collection JSON into a list of items.
 * Supports both v2 and v3 formats.
 */
export function parseCollection(json: any): CollectionItem[] {
    if (!json) return [];

    const items: CollectionItem[] = [];

    /**
     * `id` is resolved per branch — see {@link v2MemberId}. `forcedType` is for
     * the v2 fields that type their members by the field they sit in.
     */
    const pushItem = (
        item: any,
        id: string | null,
        forcedType?: CollectionItem['type'],
    ) => {
        const type = forcedType ?? resolveItemType(item);
        if (!type) return;

        items.push({
            id: id || '',
            type,
            label: resolveLanguageValue(item.label),
            thumbnail: extractThumbnail(item),
            navDate: extractNavDate(item),
        });
    };

    // The four spec shapes: v3's mixed `items`, v2's `manifests`/`collections`
    // typed by the field they sit in, and v2's mixed `members`. A bare object in
    // place of any of them is not accepted — a Collection with one entry still
    // writes an array.
    if (Array.isArray(json.items)) {
        for (const item of json.items) pushItem(item, getResourceId(item));
    }

    if (Array.isArray(json.manifests)) {
        for (const item of json.manifests) {
            pushItem(item, v2MemberId(item), 'Manifest');
        }
    }

    if (Array.isArray(json.collections)) {
        for (const item of json.collections) {
            pushItem(item, v2MemberId(item), 'Collection');
        }
    }

    if (Array.isArray(json.members)) {
        for (const item of json.members) {
            pushItem(item, v2MemberId(item));
        }
    }

    return items;
}

/**
 * Return collection items in chronology-aware navigation order.
 */
export function sortCollectionItems(items: CollectionItem[]): CollectionItem[] {
    return [...items].sort((a, b) => {
        if (a.navDate && b.navDate) {
            const dateCompare = a.navDate.localeCompare(b.navDate);
            if (dateCompare !== 0) return dateCompare;
        } else if (a.navDate) {
            return -1;
        } else if (b.navDate) {
            return 1;
        }

        const labelCompare = a.label.localeCompare(b.label);
        if (labelCompare !== 0) return labelCompare;

        return a.id.localeCompare(b.id);
    });
}
