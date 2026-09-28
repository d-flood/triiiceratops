/**
 * Projection between screen space and canvas space for drawing-layer shapes.
 */
import type { EditableGeometry } from './editableShape';

export interface Point {
    x: number;
    y: number;
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Maps a point or `null` when the viewer cannot answer for the canvas. */
export type ProjectPoint = (point: Point) => Point | null;

/** Minimum region in canvas pixels that may become an annotation. */
export const MIN_SHAPE_SIZE_CANVAS_PX = 4;

/** The media-fragment profile a `FragmentSelector`'s `xywh=` conforms to. */
export const MEDIA_FRAGMENT_CONFORMS_TO = 'http://www.w3.org/TR/media-frags/';

export function normaliseRect(from: Point, to: Point): Rect {
    return {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        width: Math.abs(to.x - from.x),
        height: Math.abs(to.y - from.y),
    };
}

export function screenDragToCanvasRect(
    from: Point,
    to: Point,
    toCanvas: ProjectPoint,
): Rect | null {
    const start = toCanvas(from);
    const end = toCanvas(to);
    if (!start || !end) return null;
    return normaliseRect(start, end);
}

/** Validity check on a finished shape, not gesture recognition. */
export function isDrawableRect(rect: Rect): boolean {
    return (
        rect.width >= MIN_SHAPE_SIZE_CANVAS_PX &&
        rect.height >= MIN_SHAPE_SIZE_CANVAS_PX
    );
}

/** Canvas-space rect as media-fragment `xywh=`, rounded to whole pixels. */
export function fragmentSelectorValue(rect: Rect): string {
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const width = Math.round(rect.x + rect.width) - x;
    const height = Math.round(rect.y + rect.height) - y;
    return `xywh=${x},${y},${width},${height}`;
}

export function canvasPixelPoint(point: Point): Point {
    return { x: Math.round(point.x), y: Math.round(point.y) };
}

/** Round once here; rounding an intermediate space lands on the wrong pixel below 1:1. */
export function screenPointToCanvasPixel(
    point: Point,
    toCanvas: ProjectPoint,
): Point | null {
    const canvas = toCanvas(point);
    return canvas ? canvasPixelPoint(canvas) : null;
}

export function canvasRectToScreenRect(
    rect: Rect,
    toScreen: ProjectPoint,
): Rect | null {
    const topLeft = toScreen({ x: rect.x, y: rect.y });
    const bottomRight = toScreen({
        x: rect.x + rect.width,
        y: rect.y + rect.height,
    });
    if (!topLeft || !bottomRight) return null;
    return normaliseRect(topLeft, bottomRight);
}

/** Whether a rect contains a point, edges included. */
export function rectContainsPoint(rect: Rect, point: Point): boolean {
    return (
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height
    );
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const POINT_HANDLE_ID = 'point';
export type PointHandleId = typeof POINT_HANDLE_ID;

export const HANDLE_IDS: readonly HandleId[] = [
    'nw',
    'n',
    'ne',
    'e',
    'se',
    's',
    'sw',
    'w',
];

export function isHandleId(id: unknown): id is HandleId {
    return (
        typeof id === 'string' && (HANDLE_IDS as readonly string[]).includes(id)
    );
}

/** Hit radius in screen pixels so aim is zoom-invariant. */
export const HANDLE_HIT_RADIUS = 12;

export interface Handle<Id = HandleId> {
    id: Id;
    x: number;
    y: number;
}

/** The eight control points of a rect, in whatever space the rect is in. */
export function rectHandles(rect: Rect): Handle[] {
    const midX = rect.x + rect.width / 2;
    const midY = rect.y + rect.height / 2;
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    const at: Record<HandleId, Point> = {
        nw: { x: rect.x, y: rect.y },
        n: { x: midX, y: rect.y },
        ne: { x: right, y: rect.y },
        e: { x: right, y: midY },
        se: { x: right, y: bottom },
        s: { x: midX, y: bottom },
        sw: { x: rect.x, y: bottom },
        w: { x: rect.x, y: midY },
    };
    return HANDLE_IDS.map((id) => ({ id, ...at[id] }));
}

/**
 * The handle a screen point reaches, or `null` when it reaches none.
 *
 * Nearest centre wins rather than first match, which is the whole reason this
 * is a function and not the DOM's own hit testing: on a small shape the corner
 * and edge handles overlap, and document order would answer with whichever was
 * rendered last rather than with the one under the pointer. Handles are still
 * real focusable elements — they simply do not take the pointer events, so that
 * this decision is made in one place and can be asserted without a browser.
 */
export function handleAtPoint<Id>(
    handles: readonly Handle<Id>[],
    point: Point,
    radius: number = HANDLE_HIT_RADIUS,
): Id | null {
    let closest: Id | null = null;
    let bestDistance = radius;
    for (const handle of handles) {
        const distance = Math.hypot(handle.x - point.x, handle.y - point.y);
        if (distance <= bestDistance) {
            bestDistance = distance;
            closest = handle.id;
        }
    }
    return closest;
}

/** Dragged handle's edges follow the pointer; past the opposite edge flips rather than going negative. */
export function resizeRect(rect: Rect, handle: HandleId, to: Point): Rect {
    let left = rect.x;
    let top = rect.y;
    let right = rect.x + rect.width;
    let bottom = rect.y + rect.height;

    if (handle.includes('w')) left = to.x;
    if (handle.includes('e')) right = to.x;
    if (handle.includes('n')) top = to.y;
    if (handle.includes('s')) bottom = to.y;

    return normaliseRect({ x: left, y: top }, { x: right, y: bottom });
}

export function moveRect(rect: Rect, delta: Point): Rect {
    return {
        x: rect.x + delta.x,
        y: rect.y + delta.y,
        width: rect.width,
        height: rect.height,
    };
}

export function inflateRect(rect: Rect, by: number): Rect {
    return {
        x: rect.x - by,
        y: rect.y - by,
        width: rect.width + by * 2,
        height: rect.height + by * 2,
    };
}

/** `null` for non-spatial fragments, including temporal `t=`. */
export function parseFragmentRect(value: unknown): Rect | null {
    if (typeof value !== 'string') return null;
    const match =
        /^xywh=(?:pixel:)?([\d.-]+),([\d.-]+),([\d.-]+),([\d.-]+)$/.exec(
            value.trim(),
        );
    if (!match) return null;
    const numbers = match.slice(1, 5).map(Number);
    if (numbers.some((number) => !Number.isFinite(number))) return null;
    const [x, y, width, height] = numbers;
    if (width <= 0 || height <= 0) return null;
    return { x, y, width, height };
}

/** 64 so the shape still reads as an ellipse at 8x. */
export const ELLIPSE_VERTEX_COUNT = 64;

/** The fewest vertices a closed region can have. */
export const MIN_POLYGON_VERTICES = 3;

export function ellipseVertices(rect: Rect): Point[] {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const rx = rect.width / 2;
    const ry = rect.height / 2;
    return Array.from({ length: ELLIPSE_VERTEX_COUNT }, (_, index) => {
        const angle = (index / ELLIPSE_VERTEX_COUNT) * 2 * Math.PI;
        return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
    });
}

export function polygonBounds(points: readonly Point[]): Rect | null {
    if (points.length === 0) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
        x,
        y,
        width: Math.max(...xs) - x,
        height: Math.max(...ys) - y,
    };
}

function svgCoordinate(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Root `<svg>` required; core parses via DOMParser collecting `points`. */
export function svgPolygonValue(points: readonly Point[]): string {
    const attribute = points
        .map((point) => `${svgCoordinate(point.x)},${svgCoordinate(point.y)}`)
        .join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="${attribute}" /></svg>`;
}

/** Narrower than core: opening degraded shapes would silently replace the author's shape on write. */
export function parseSvgPolygon(value: unknown): Point[] | null {
    if (typeof value !== 'string') return null;
    const shapes = [
        ...value.matchAll(/<polygon\b[^>]*\bpoints\s*=\s*"([^"]*)"/g),
    ];
    if (shapes.length !== 1) return null;
    const points: Point[] = [];
    for (const pair of shapes[0][1].trim().split(/\s+/)) {
        const [x, y] = pair.split(',').map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        points.push({ x, y });
    }
    return points.length >= MIN_POLYGON_VERTICES ? points : null;
}

export function pointHandles(point: Point): Handle<PointHandleId>[] {
    return [{ id: POINT_HANDLE_ID, ...point }];
}

export function polygonHandles(points: readonly Point[]): Handle<number>[] {
    return points.map((point, index) => ({ id: index, ...point }));
}

export function moveVertex(
    points: readonly Point[],
    index: number,
    to: Point,
): Point[] {
    return points.map((point, at) => (at === index ? { ...to } : point));
}

export function movePolygon(points: readonly Point[], delta: Point): Point[] {
    return points.map((point) => ({
        x: point.x + delta.x,
        y: point.y + delta.y,
    }));
}

export function insertVertex(
    points: readonly Point[],
    index: number,
    at: Point,
): Point[] {
    const inserted = [...points];
    inserted.splice(index, 0, { ...at });
    return inserted;
}

/** `null` when removal would leave fewer than 3 vertices. */
export function removeVertex(
    points: readonly Point[],
    index: number,
): Point[] | null {
    if (points.length <= MIN_POLYGON_VERTICES) return null;
    if (index < 0 || index >= points.length) return null;
    return points.filter((_, at) => at !== index);
}

export function nearestEdgeInsertIndex(
    points: readonly Point[],
    point: Point,
): number {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length; index++) {
        const from = points[index];
        const to = points[(index + 1) % points.length];
        const distance = distanceToSegment(point, from, to);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = index + 1;
        }
    }
    return best;
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
        lengthSquared === 0
            ? 0
            : Math.max(
                  0,
                  Math.min(
                      1,
                      ((point.x - from.x) * dx + (point.y - from.y) * dy) /
                          lengthSquared,
                  ),
              );
    return Math.hypot(from.x + t * dx - point.x, from.y + t * dy - point.y);
}

/** Crossing count; bbox test would wrongly include concave notches. */
export function polygonContainsPoint(
    points: readonly Point[],
    point: Point,
): boolean {
    let inside = false;
    for (let index = 0; index < points.length; index++) {
        const a = points[index];
        const b = points[(index + 1) % points.length];
        const crosses = a.y > point.y !== b.y > point.y;
        if (
            crosses &&
            point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
        ) {
            inside = !inside;
        }
    }
    return inside;
}

/** Nudge steps in canvas pixels so a step means the same at any zoom. */
export const NUDGE_STEP_CANVAS_PX = 1;
export const NUDGE_LARGE_STEP_CANVAS_PX = 10;

/** Screen y grows downward, so `ArrowUp` is negative y. */
const NUDGE_DIRECTIONS: Record<string, Point> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
};

/** `null` for non-arrow keys so the event reaches whatever else wants it. */
export function nudgeDelta(key: string, large: boolean): Point | null {
    const direction = NUDGE_DIRECTIONS[key];
    if (!direction) return null;
    const step = large ? NUDGE_LARGE_STEP_CANVAS_PX : NUDGE_STEP_CANVAS_PX;
    return { x: direction.x * step, y: direction.y * step };
}

export function translatePoint(point: Point, delta: Point): Point {
    return { x: point.x + delta.x, y: point.y + delta.y };
}

/** Fraction of the current view so the default is visible at any zoom. */
export const DEFAULT_SHAPE_VIEW_FRACTION = 0.25;

export function centredRect(
    centre: Point,
    width: number,
    height: number,
): Rect {
    return {
        x: centre.x - width / 2,
        y: centre.y - height / 2,
        width,
        height,
    };
}

export function triangleVertices(rect: Rect): Point[] {
    const bottom = rect.y + rect.height;
    return [
        { x: rect.x + rect.width / 2, y: rect.y },
        { x: rect.x + rect.width, y: bottom },
        { x: rect.x, y: bottom },
    ];
}

export function insertVertexAfter(
    points: readonly Point[],
    index: number,
): Point[] | null {
    if (index < 0 || index >= points.length) return null;
    const from = points[index];
    const to = points[(index + 1) % points.length];
    return insertVertex(points, index + 1, {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2,
    });
}

/** Kinds never compare equal; points compare at whole canvas pixels. */
export function geometriesEqual(
    a: EditableGeometry,
    b: EditableGeometry,
): boolean {
    if (a.kind === 'rect' && b.kind === 'rect') {
        return (
            a.rect.x === b.rect.x &&
            a.rect.y === b.rect.y &&
            a.rect.width === b.rect.width &&
            a.rect.height === b.rect.height
        );
    }
    if (a.kind === 'polygon' && b.kind === 'polygon') {
        return (
            a.points.length === b.points.length &&
            a.points.every((point, index) => {
                const other = b.points[index];
                return point.x === other.x && point.y === other.y;
            })
        );
    }
    if (a.kind === 'point' && b.kind === 'point') {
        const one = canvasPixelPoint(a.point);
        const other = canvasPixelPoint(b.point);
        return one.x === other.x && one.y === other.y;
    }
    return false;
}
