/** Reading persisted geometry for editing and writing it back; all canvas space. */
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

export type EditableGeometry =
    | { kind: 'rect'; rect: Rect }
    | { kind: 'polygon'; points: Point[] }
    | { kind: 'point'; point: Point };

export interface EditableShape {
    canvasId: string;
    geometry: EditableGeometry;
}

function soleTarget(annotation: W3CAnnotation): W3CTarget | null {
    const target = annotation.target;
    if (Array.isArray(target)) {
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
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { kind: 'point', point: { x, y } };
    }
    return null;
}

/** `null` must not be opened: the caller suppresses core rendering of whatever it opens. */
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

export function withEditedGeometry(
    annotation: W3CAnnotation,
    geometry: EditableGeometry,
): W3CAnnotation {
    const target = soleTarget(annotation);
    const selector = target ? soleSelector(target) : null;
    if (!target || !selector) return annotation;

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

export function isCommittableGeometry(geometry: EditableGeometry): boolean {
    if (geometry.kind === 'point') return true;
    const bounds =
        geometry.kind === 'rect'
            ? geometry.rect
            : polygonBounds(geometry.points);
    return bounds !== null && isDrawableRect(bounds);
}
