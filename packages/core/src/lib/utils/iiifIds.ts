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

/**
 * {@link getCanvasId} under the name its annotation callers read it by: the
 * `id`/`@id` read is the same one, and `''` means "no id" for both.
 */
export const getAnnotationId = getCanvasId;

/**
 * A canvas id resolved against the page, or `''` for one that cannot be.
 *
 * `''` never matches anything, which is what makes the fallback below safe
 * where there is no document to resolve against — a server render, say.
 */
function resolvedCanvasId(id: string): string {
    if (!id) return '';
    try {
        return new URL(
            id,
            typeof document === 'undefined' ? undefined : document.baseURI,
        ).href;
    } catch {
        return '';
    }
}

export function findCanvasIndexById(
    canvases: any[],
    canvasId: string | null,
): number {
    if (!canvasId) {
        return -1;
    }

    const exact = canvases.findIndex(
        (canvas: any) => getCanvasId(canvas) === canvasId,
    );
    if (exact >= 0) {
        return exact;
    }

    return canvases.findIndex((canvas: any) =>
        sameCanvasId(getCanvasId(canvas), canvasId),
    );
}

/**
 * Whether two ids name one canvas.
 *
 * Two spellings reach the viewer for the same thing: a content state names its
 * target by absolute URI, which the Content State API requires of it, while a
 * manifest is free to declare a relative one — against the spec, and common
 * enough that refusing to match would send a reader who dropped a perfectly
 * good content state to the wrong canvas, or drop the region it asked for.
 */
export function sameCanvasId(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;

    const left = resolvedCanvasId(a);
    return !!left && left === resolvedCanvasId(b);
}

export function findCanvasById(canvases: any[], canvasId: string | null): any {
    const index = findCanvasIndexById(canvases, canvasId);
    return index >= 0 ? canvases[index] : null;
}
