/**
 * Parsed annotation interface for custom rendering
 */
export interface ParsedAnnotation {
    id: string;
    renderId: string;
    sourceAnnotationId: string;
    geometryIndex: number;
    geometry: RectangleGeometry | PolygonGeometry | PointGeometry;
    coordinateSpace: 'canvas' | 'image';
    isFullCanvasTarget: boolean;
    body: {
        value: string;
        isHtml: boolean;
        purpose?: string;
        format?: string;
    }[];
    isSearchHit: boolean;
}
export interface RectangleGeometry {
    type: 'RECTANGLE';
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface PolygonGeometry {
    type: 'POLYGON';
    points: [number, number][];
}
export interface PointGeometry {
    type: 'POINT';
    x: number;
    y: number;
}
export declare function isFullCanvasAnnotation(annotation: any): boolean;
/**
 * Extract xywh from annotation target (multiple formats)
 */
/**
 * Extract annotation body content (text, label, etc)
 */
export declare function extractBody(annotation: any): {
    value: string;
    isHtml: boolean;
    purpose?: string;
    format?: string;
}[];
/**
 * Parse a raw JSON IIIF annotation to internal format
 */
export declare function parseAnnotation(annotation: any, index: number, isSearchHit?: boolean): ParsedAnnotation | null;
/**
 * Batch parse annotations
 */
export declare function parseAnnotations(annotations: any[], searchHitIds?: Set<string>): ParsedAnnotation[];
