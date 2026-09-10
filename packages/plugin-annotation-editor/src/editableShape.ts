/**
 * Reading a persisted annotation's geometry back out for editing, and writing
 * an edited geometry back in — the inverse of the target the drawing layer
 * builds when it commits a new shape.
 *
 * Pure functions over the W3C structure, so the round trip is asserted without
 * a browser. Everything is CANVAS space, the space the store deals in.
 */
import type {
    FragmentSelector,
    PointSelector,
    SvgSelector,
    W3CAnnotation,
    W3CSelector,
    W3CTarget,
} from './adapters/types';
import {
    canvasPixelPoint,
    fragmentSelectorValue,
    isDrawableRect,
    MEDIA_FRAGMENT_CONFORMS_TO,
    parseFragmentRect,
    parseSvgPolygon,
    polygonBounds,
    svgPolygonValue,
    type Point,
    type Rect,
} from './geometry';

/**
 * The geometry a shape edits as. A rectangle, a polygon and a point are the
 * three this editor writes: an ellipse is drawn as a bounding box and persisted
 * as a polygon, so it comes back as the polygon it is and edits by its
 * vertices.
 */
export type EditableGeometry =
    | { kind: 'rect'; rect: Rect }
    | { kind: 'polygon'; points: Point[] }
    | { kind: 'point'; point: Point };

/** A persisted shape reduced to the canvas it is on and its canvas-space geometry. */
export interface EditableShape {
    canvasId: string;
    geometry: EditableGeometry;
}

function soleTarget(annotation: W3CAnnotation): W3CTarget | null {
    const target = annotation.target;
    if (Array.isArray(target)) {
        // A multi-target annotation has several geometries and no single box to
        // put handles on. Core renders them all on read; this work does not
        // write them, so it declines to edit them either.
        return target.length === 1 ? (target[0] ?? null) : null;
    }
    return target ?? null;
}

function soleSelector(target: W3CTarget): W3CSelector | null {
    const selector = target.selector;
    if (!selector || Array.isArray(selector)) return null;
    return selector;
}

function readGeometry(selector: W3CSelector): EditableGeometry | null {
    if (selector.type === 'FragmentSelector') {
        const rect = parseFragmentRect((selector as FragmentSelector).value);
        return rect ? { kind: 'rect', rect } : null;
    }
    if (selector.type === 'SvgSelector') {
        const points = parseSvgPolygon((selector as SvgSelector).value);
        return points ? { kind: 'polygon', points } : null;
    }
    if (selector.type === 'PointSelector') {
        const { x, y } = selector as PointSelector;
        // A `PointSelector` whose coordinates are not numbers names no point,
        // and opening it would suppress core's rendering of an annotation this
        // editor could not put a handle on.
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { kind: 'point', point: { x, y } };
    }
    return null;
}

/**
 * The geometry to open for editing, or `null` when this annotation has none
 * this editor can offer control points on — a whole-canvas target, which has no
 * geometry at all, or a shape whose target it does not model.
 *
 * `null` is load-bearing rather than merely defensive: the caller suppresses
 * core's own rendering of whatever it opens, so an annotation it cannot draw
 * must not be opened at all — suppressed and undrawn reads to the reader as
 * data loss.
 */
export function editableShape(annotation: W3CAnnotation): EditableShape | null {
    const target = soleTarget(annotation);
    if (!target || typeof target.source !== 'string' || !target.source) {
        return null;
    }
    const selector = soleSelector(target);
    if (!selector) return null;
    const geometry = readGeometry(selector);
    return geometry ? { canvasId: target.source, geometry } : null;
}

/**
 * The same annotation with its geometry replaced. Every other field — bodies,
 * host-specific properties, the selector's own extra keys — is carried through,
 * because an edit to the geometry must not be a rewrite of the record.
 *
 * The selector KIND is carried through too: an edited rectangle stays a
 * fragment and an edited polygon stays an `SvgSelector`, so nothing changes
 * representation behind the reader's back.
 */
export function withEditedGeometry(
    annotation: W3CAnnotation,
    geometry: EditableGeometry,
): W3CAnnotation {
    const target = soleTarget(annotation);
    const selector = target ? soleSelector(target) : null;
    if (!target || !selector) return annotation;

    // A point carries its geometry in `x`/`y` rather than in a `value`, and is
    // the one selector kind written back as coordinates.
    if (geometry.kind === 'point') {
        if (selector.type !== 'PointSelector') return annotation;
        const { x, y } = canvasPixelPoint(geometry.point);
        return {
            ...annotation,
            target: { ...target, selector: { ...selector, x, y } },
        };
    }

    const value =
        geometry.kind === 'rect'
            ? selector.type === 'FragmentSelector'
                ? fragmentSelectorValue(geometry.rect)
                : null
            : selector.type === 'SvgSelector'
              ? svgPolygonValue(geometry.points)
              : null;
    if (value === null) return annotation;

    return {
        ...annotation,
        target: { ...target, selector: { ...selector, value } },
    };
}

/**
 * The selector a geometry is persisted as — the write half of
 * {@link readGeometry}, and the one place a NEW annotation's target kind is
 * decided.
 *
 * The geometry's kind is the whole decision: a box is a media fragment, an
 * outline is an `SvgSelector`, a point is a `PointSelector`. An ellipse has
 * already become the polygon inscribed in its box by the time it arrives here,
 * which is why there is no fourth arm (ADR 0022).
 */
export function selectorForGeometry(geometry: EditableGeometry): W3CSelector {
    if (geometry.kind === 'rect') {
        return {
            type: 'FragmentSelector',
            conformsTo: MEDIA_FRAGMENT_CONFORMS_TO,
            value: fragmentSelectorValue(geometry.rect),
        };
    }
    if (geometry.kind === 'polygon') {
        return {
            type: 'SvgSelector',
            value: svgPolygonValue(geometry.points),
        };
    }
    const { x, y } = canvasPixelPoint(geometry.point);
    return { type: 'PointSelector', x, y };
}

/**
 * Whether a geometry is large enough to persist — the minimum-size guard on a
 * COMMITTED shape, applied to whatever box the geometry spans. A point is
 * exempt: it has no extent to fall below the threshold.
 */
export function isCommittableGeometry(geometry: EditableGeometry): boolean {
    if (geometry.kind === 'point') return true;
    const bounds =
        geometry.kind === 'rect'
            ? geometry.rect
            : polygonBounds(geometry.points);
    return bounds !== null && isDrawableRect(bounds);
}
