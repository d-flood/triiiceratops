export function getResourceId(resource: any): string | null {
    // IIIF v3 spells it `id`, v2 spells it `@id`; both are read here, so this
    // is a complete raw-JSON read for either version.
    return resource?.id || resource?.['@id'] || null;
}

/**
 * A IIIF reference may be a bare id string (common in Presentation 2.x, e.g. a
 * sequence's `startCanvas`), an object carrying `id`/`@id`, or a
 * `SpecificResource` naming its referent through `source`. Returns the id of
 * the resource referred to in every case.
 */
export function getReferenceId(reference: unknown): string | null {
    if (typeof reference === 'string') {
        return reference || null;
    }

    // A SpecificResource's own `id` names the selection, not the resource it
    // selects from, so `source` wins wherever both are present. (Cookbook
    // 0015's `start` is exactly this shape.)
    const source = (reference as { source?: unknown } | null | undefined)
        ?.source;
    if (source) {
        return getReferenceId(source);
    }

    return getResourceId(reference);
}

export function getCanvasId(canvas: any): string {
    return getResourceId(canvas) || '';
}

export function getAnnotationId(annotation: any): string {
    return annotation?.id || annotation?.['@id'] || '';
}

export function findCanvasIndexById(
    canvases: any[],
    canvasId: string | null,
): number {
    if (!canvasId) {
        return -1;
    }

    return canvases.findIndex(
        (canvas: any) => getCanvasId(canvas) === canvasId,
    );
}

export function findCanvasById(canvases: any[], canvasId: string | null): any {
    const index = findCanvasIndexById(canvases, canvasId);
    return index >= 0 ? canvases[index] : null;
}
