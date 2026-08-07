export function getResourceId(resource) {
    // IIIF v3 spells it `id`, v2 spells it `@id`; both are read here, so this
    // is a complete raw-JSON read for either version.
    return resource?.id || resource?.['@id'] || null;
}
/**
 * A IIIF reference may be a bare id string (common in Presentation 2.x, e.g. a
 * sequence's `startCanvas`) or an object carrying `id`/`@id`. Returns the id
 * either way.
 */
export function getReferenceId(reference) {
    if (typeof reference === 'string') {
        return reference || null;
    }
    return getResourceId(reference);
}
export function getCanvasId(canvas) {
    return getResourceId(canvas) || '';
}
export function getAnnotationId(annotation) {
    return annotation?.id || annotation?.['@id'] || '';
}
export function findCanvasIndexById(canvases, canvasId) {
    if (!canvasId) {
        return -1;
    }
    return canvases.findIndex((canvas) => getCanvasId(canvas) === canvasId);
}
export function findCanvasById(canvases, canvasId) {
    const index = findCanvasIndexById(canvases, canvasId);
    return index >= 0 ? canvases[index] : null;
}
