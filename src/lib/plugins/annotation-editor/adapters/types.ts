import type { W3CAnnotationBody, AnnotationStorageAdapter } from '../types';

/**
 * IIIF/W3C media-fragment selector (`xywh=…`, `t=…`). The value carries the
 * fragment expression.
 */
export interface FragmentSelector {
    type: 'FragmentSelector';
    conformsTo?: string;
    value: string;
    [key: string]: unknown;
}

/** IIIF `PointSelector` — a single canvas-space point (integer px per D2). */
export interface PointSelector {
    type: 'PointSelector';
    x: number;
    y: number;
    [key: string]: unknown;
}

/** W3C `SvgSelector` — an SVG shape (polygon, path, …) as its `value`. */
export interface SvgSelector {
    type: 'SvgSelector';
    value: string;
    [key: string]: unknown;
}

/**
 * Escape hatch for selector types the plugin doesn't model explicitly (e.g. a
 * `RangeSelector`, or a host-specific selector). Keeps the union open so a
 * round-trip never narrows away an unknown selector.
 */
export interface UnknownSelector {
    type: string;
    [key: string]: unknown;
}

/** Open selector union — never narrow away unknown selector types. */
export type W3CSelector =
    | FragmentSelector
    | PointSelector
    | SvgSelector
    | UnknownSelector;

/** W3C Web Annotation target (a `SpecificResource` pointing at a canvas). */
export interface W3CTarget {
    type?: string;
    source: string;
    selector?: W3CSelector | W3CSelector[];
    [key: string]: unknown;
}

/**
 * W3C Web Annotation structure. Generic over the body shape so a host with a
 * structured/custom body gets compiler help end-to-end; `TBody` defaults to the
 * built-in {@link W3CAnnotationBody}. The index signature is an intentional
 * escape hatch so host-specific fields survive a load → edit → save round-trip
 * instead of being dropped by the type.
 */
export interface W3CAnnotation<TBody = W3CAnnotationBody> {
    '@context'?: string | string[];
    id: string;
    type: 'Annotation';
    body?: TBody | TBody[];
    target: W3CTarget | W3CTarget[];
    creator?: {
        id?: string;
        name?: string;
        [key: string]: unknown;
    };
    created?: string;
    modified?: string;
    motivation?: string | string[];
    [key: string]: unknown;
}

/**
 * Shape an adapter's `load()`/`hydrate()` may return. Beyond a stored
 * annotation it may carry the internal skeleton markers the plugin reads exactly
 * once and strips before anything enters the cache or Annotorious (ticket 03):
 * `__fullBodyLoaded: false` signals a skeleton whose body must be fetched via
 * `hydrate()`. These markers are NOT part of the stored annotation contract —
 * they never round-trip — so they live here rather than on {@link W3CAnnotation}.
 */
export type AdapterLoadResult<TBody = W3CAnnotationBody> = W3CAnnotation<TBody> & {
    __fullBodyLoaded?: boolean;
    __bodyPreview?: string | null;
};

// Re-export for convenience
export type { AnnotationStorageAdapter };
