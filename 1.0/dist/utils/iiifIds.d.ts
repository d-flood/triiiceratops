export declare function getResourceId(resource: any): string | null;
/**
 * A IIIF reference may be a bare id string (common in Presentation 2.x, e.g. a
 * sequence's `startCanvas`) or an object carrying `id`/`@id`. Returns the id
 * either way.
 */
export declare function getReferenceId(reference: unknown): string | null;
export declare function getCanvasId(canvas: any): string;
export declare function getAnnotationId(annotation: any): string;
export declare function findCanvasIndexById(canvases: any[], canvasId: string | null): number;
export declare function findCanvasById(canvases: any[], canvasId: string | null): any;
