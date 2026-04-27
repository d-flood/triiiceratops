export function getResourceId(resource: any): string | null {
    return (
        resource?.id ||
        resource?.['@id'] ||
        resource?.__jsonld?.id ||
        resource?.__jsonld?.['@id'] ||
        (typeof resource?.getId === 'function' ? resource.getId() : null) ||
        null
    );
}

export function getCanvasId(canvas: any): string {
    return (
        getResourceId(canvas) ||
        (typeof canvas?.getCanvasId === 'function'
            ? canvas.getCanvasId()
            : null) ||
        (typeof canvas?.getId === 'function' ? canvas.getId() : null) ||
        ''
    );
}

export function getAnnotationId(annotation: any): string {
    return (
        annotation?.id ||
        annotation?.['@id'] ||
        (typeof annotation?.getId === 'function' ? annotation.getId() : '') ||
        ''
    );
}

export function findCanvasIndexById(
    canvases: any[],
    canvasId: string | null,
): number {
    if (!canvasId) {
        return -1;
    }

    return canvases.findIndex((canvas: any) => getCanvasId(canvas) === canvasId);
}

export function findCanvasById(canvases: any[], canvasId: string | null): any {
    const index = findCanvasIndexById(canvases, canvasId);
    return index >= 0 ? canvases[index] : null;
}
