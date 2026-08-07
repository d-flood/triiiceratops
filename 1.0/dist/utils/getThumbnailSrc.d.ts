export declare function resolveThumbnailResourceSrc(thumbnail: any, size?: number): string;
/**
 * Extract a thumbnail URL from a IIIF Canvas.
 *
 * Follows the same fallback chain used by ThumbnailGallery:
 *   1. The canvas's own `thumbnail` property
 *   2. First image annotation → IIIF service → {serviceId}/full/{size},/0/default.jpg
 *   3. Raw resource / body ID
 */
export declare function getThumbnailSrc(canvas: any, size?: number): string;
