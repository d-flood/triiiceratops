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
    /** Optional navDate (ISO 8601) for chronological navigation */
    navDate?: string;
}
/**
 * Determine if a JSON resource is a IIIF Collection.
 */
export declare function isCollection(json: any): boolean;
/**
 * Get the label of a collection from its JSON.
 */
export declare function getCollectionLabel(json: any): string;
/**
 * Get the thumbnail of a collection from its JSON.
 */
export declare function getCollectionThumbnail(json: any): string | undefined;
/**
 * Parse a IIIF Collection JSON into a list of items.
 * Supports both v2 and v3 formats.
 */
export declare function parseCollection(json: any): CollectionItem[];
/**
 * Return collection items in chronology-aware navigation order.
 */
export declare function sortCollectionItems(items: CollectionItem[]): CollectionItem[];
