/**
 * Projection between the viewer's screen space and a canvas's own coordinate
 * space, for the shapes the drawing layer commits.
 *
 * Pure functions only — no Svelte, no DOM. The caller supplies the projection
 * as a callback (core's `screenToCanvas` / `canvasToScreen` bound to a canvas
 * id), so every geometric claim here is asserted without a browser (story 42).
 */

// Type-only, and so erased: `editableShape` builds `EditableGeometry` out of
// this module's own `Point` and `Rect`, and nothing here imports its runtime.
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

/**
 * Maps a point from one space to the other, or `null` when the viewer cannot
 * answer for the canvas asked about — core's coordinate helpers return `null`
 * rather than a point belonging to a different canvas.
 */
export type ProjectPoint = (point: Point) => Point | null;

/**
 * The smallest region, in CANVAS pixels, that may become an annotation.
 *
 * Canvas pixels rather than screen pixels because the shape is persisted in
 * canvas space: the same drag at 8× zoom and at fit zoom must be judged the same
 * way, and only the canvas-space extent is invariant across the zoom the reader
 * happens to be at. Four is above the two-pixel hand jitter this guard exists to
 * discard (story 7), and far below any region a reader would deliberately draw
 * on a folio-sized canvas — a IIIF canvas of a manuscript page runs to thousands
 * of units across, so four of them are a smudge, not a feature.
 */
export const MIN_SHAPE_SIZE_CANVAS_PX = 4;

/** The media-fragment profile a `FragmentSelector`'s `xywh=` conforms to. */
export const MEDIA_FRAGMENT_CONFORMS_TO = 'http://www.w3.org/TR/media-frags/';

/**
 * The axis-aligned box two corners span, in whichever order they were given —
 * a drag up-and-left describes the same region as the same drag reversed.
 */
export function normaliseRect(from: Point, to: Point): Rect {
    return {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        width: Math.abs(to.x - from.x),
        height: Math.abs(to.y - from.y),
    };
}

/**
 * The canvas-space box a screen-space drag describes.
 *
 * Both corners are projected before they are normalised, so the result is the
 * box in the canvas's own coordinates whatever the viewport's zoom and pan are.
 * `null` when either corner does not project — the drag then belongs to no
 * canvas and nothing may be committed from it.
 */
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

/**
 * Whether a committed region is large enough to persist
 * ({@link MIN_SHAPE_SIZE_CANVAS_PX}). A validity check on a finished shape, not
 * gesture recognition: the armed tool already decided the gesture was a drag.
 */
export function isDrawableRect(rect: Rect): boolean {
    return (
        rect.width >= MIN_SHAPE_SIZE_CANVAS_PX &&
        rect.height >= MIN_SHAPE_SIZE_CANVAS_PX
    );
}

/**
 * A canvas-space rect as a media-fragment `xywh=` value.
 *
 * Rounded to whole canvas pixels — the unit a IIIF canvas is expressed in, and
 * what every reader of the fragment (core's own target parser included) treats
 * the numbers as. Edges are rounded rather than origin-plus-size so a rect never
 * grows or shrinks by a pixel more than the rounding of its own edges.
 */
export function fragmentSelectorValue(rect: Rect): string {
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const width = Math.round(rect.x + rect.width) - x;
    const height = Math.round(rect.y + rect.height) - y;
    return `xywh=${x},${y},${width},${height}`;
}

/* ===== Points ===== */

/**
 * A canvas-space point snapped to whole canvas pixels — the unit a
 * `PointSelector`'s `x`/`y` are written in (ADR 0004). Floats were rejected as
 * spurious precision that diffs noisily and diverges from the published IIIF
 * examples, so this is the only rounding a point ever gets.
 */
export function canvasPixelPoint(point: Point): Point {
    return { x: Math.round(point.x), y: Math.round(point.y) };
}

/**
 * The canvas pixel a screen point names — the point tool's ENTIRE geometry, a
 * single click with no extent and so no minimum-size guard to pass.
 *
 * The rounding happens once, here, on the projected canvas point. Rounding an
 * intermediate space instead — the screen point the pointer reported, or an
 * image-space step on the way — lands on a different canvas pixel wherever the
 * canvas is larger in its own coordinates than it is on screen, which is every
 * zoom below 1:1. `null` when the point projects to no canvas.
 */
export function screenPointToCanvasPixel(
    point: Point,
    toCanvas: ProjectPoint,
): Point | null {
    const canvas = toCanvas(point);
    return canvas ? canvasPixelPoint(canvas) : null;
}

/**
 * The screen-space box a canvas-space rect currently occupies, for the live
 * preview — recomputed whenever the viewport moves. `null` when the rect's
 * canvas is not one the renderer is placing.
 */
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

/**
 * The control points a bounding-box shape offers: four corners and four edge
 * midpoints, named by compass direction so a handle's id says which edges it
 * moves — `'nw'` moves the north and west edges, `'n'` only the north one.
 *
 * A polygon's control points are its vertices instead, identified by index, so
 * a handle's id is whatever names the thing it moves.
 */
export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/**
 * The one control point a point annotation offers. Editing a point is moving
 * it, so its handle and its geometry are the same thing — but it goes through
 * the same {@link handleAtPoint} test as every other control point rather than
 * being a parallel mechanism.
 */
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

/**
 * Whether a control-point id names a bounding box's compass edge, as opposed to
 * a polygon vertex's index or a point's single handle. The three share one drag
 * and one hit test, so the id is what says which shape's maths to run.
 */
export function isHandleId(id: unknown): id is HandleId {
    return (
        typeof id === 'string' && (HANDLE_IDS as readonly string[]).includes(id)
    );
}

/**
 * How far, in SCREEN pixels, a pointer may be from a handle's centre and still
 * reach it — half of a comfortable touch target rather than the handle's drawn
 * size, so a handle is grabbable slightly beyond the dot the reader sees.
 *
 * Screen pixels because it describes the reader's aim, which does not change
 * with the zoom: the same finger has to hit the same handle at fit zoom and at
 * 8×.
 */
export const HANDLE_HIT_RADIUS = 12;

/**
 * A control point on screen. Generic over what identifies it: a compass edge
 * for a bounding box, a vertex index for a polygon. Both go through the same
 * hit test, so nearest-centre-wins is decided in one place for every shape.
 */
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

/**
 * The rect a handle dragged to `to` describes. The dragged handle's own edges
 * follow the pointer and the opposite ones stay put; a drag past the opposite
 * edge flips the rect rather than producing a negative extent.
 */
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

/** The same rect translated — a move never changes width or height. */
export function moveRect(rect: Rect, delta: Point): Rect {
    return {
        x: rect.x + delta.x,
        y: rect.y + delta.y,
        width: rect.width,
        height: rect.height,
    };
}

/** A rect grown by `by` on every side, for a box that must contain its handles. */
export function inflateRect(rect: Rect, by: number): Rect {
    return {
        x: rect.x - by,
        y: rect.y - by,
        width: rect.width + by * 2,
        height: rect.height + by * 2,
    };
}

/**
 * The rect a media-fragment `xywh=` value names — the read half of
 * {@link fragmentSelectorValue}. `null` for anything that is not a spatial
 * fragment, a temporal `t=` included.
 */
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

/* ===== Polygons ===== */

/**
 * How many vertices an ellipse's inscribed polygon carries.
 *
 * 64 rather than the more common 32 because this viewer is a deep-zoom one: at
 * the magnifications a reader reaches on a folio, a 32-gon's facets are visibly
 * flat straight edges rather than a curve. Do not lower it — the cost is 64
 * coordinate pairs in a selector, and the benefit is the shape still reading as
 * an ellipse at 8×.
 */
export const ELLIPSE_VERTEX_COUNT = 64;

/** The fewest vertices a closed region can have. */
export const MIN_POLYGON_VERTICES = 3;

/**
 * The polygon inscribed in a bounding box: {@link ELLIPSE_VERTEX_COUNT} vertices
 * on the ellipse the box circumscribes, starting due east and winding clockwise
 * on screen (y grows downward).
 *
 * This is the ellipse tool's ENTIRE output. Nothing downstream records that the
 * polygon was drawn as an ellipse: core's projector has three geometries and its
 * SVG parser already degrades `<ellipse>` into points on read, so an ellipse
 * that persisted as one would lose fidelity on every round trip.
 */
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

/** The axis-aligned box a set of points spans; `null` for no points. */
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

/**
 * Rounded to hundredths, unlike a media fragment's whole pixels: SVG
 * coordinates carry no pixel-unit convention, and a 64-gon inscribed in a small
 * box loses its roundness if every vertex snaps to an integer.
 */
function svgCoordinate(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * A closed polygon as an `SvgSelector` value, in the canvas's own coordinates.
 *
 * `<polygon>` inside a root `<svg>`, which is what core's selector parser reads
 * — it runs `DOMParser` over the value and collects `points` attributes, so a
 * bare `<polygon>` with no root element would not parse.
 */
export function svgPolygonValue(points: readonly Point[]): string {
    const attribute = points
        .map((point) => `${svgCoordinate(point.x)},${svgCoordinate(point.y)}`)
        .join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="${attribute}" /></svg>`;
}

/**
 * The vertices an `SvgSelector` value names — the read half of
 * {@link svgPolygonValue}. `null` for anything this editor did not write:
 * curves, multiple shapes, or too few points to close a region.
 *
 * Deliberately narrower than core's parser, which approximates `<circle>`,
 * `<rect>` and `<path>` too. Core degrades those to draw them; this editor
 * would have to WRITE the degraded form back, silently replacing the author's
 * shape, so it declines to open them at all.
 */
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

/** A point's single handle, at the point itself. */
export function pointHandles(point: Point): Handle<PointHandleId>[] {
    return [{ id: POINT_HANDLE_ID, ...point }];
}

/** The polygon's vertices as handles, each identified by its own index. */
export function polygonHandles(points: readonly Point[]): Handle<number>[] {
    return points.map((point, index) => ({ id: index, ...point }));
}

/** The same polygon with one vertex moved; every other vertex stays put. */
export function moveVertex(
    points: readonly Point[],
    index: number,
    to: Point,
): Point[] {
    return points.map((point, at) => (at === index ? { ...to } : point));
}

/** The same polygon translated — a move never reshapes the outline. */
export function movePolygon(points: readonly Point[], delta: Point): Point[] {
    return points.map((point) => ({
        x: point.x + delta.x,
        y: point.y + delta.y,
    }));
}

/** The same polygon with `at` spliced in before vertex `index`. */
export function insertVertex(
    points: readonly Point[],
    index: number,
    at: Point,
): Point[] {
    const inserted = [...points];
    inserted.splice(index, 0, { ...at });
    return inserted;
}

/**
 * The same polygon without vertex `index`, or `null` when removing it would
 * leave fewer than {@link MIN_POLYGON_VERTICES} — a two-vertex ring is a line
 * segment, which is not a region and which core's parser would close into one
 * anyway.
 */
export function removeVertex(
    points: readonly Point[],
    index: number,
): Point[] | null {
    if (points.length <= MIN_POLYGON_VERTICES) return null;
    if (index < 0 || index >= points.length) return null;
    return points.filter((_, at) => at !== index);
}

/**
 * Where a new vertex belongs for a point pressed on the outline: the index to
 * insert BEFORE, chosen as the end of the closest edge, so the inserted vertex
 * lands between the two it was dragged out from.
 */
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
    // A degenerate edge (two coincident vertices) is just its endpoint.
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

/**
 * Whether a point is inside a closed polygon, by crossing count. Used to decide
 * whether a press moves the whole shape, so a press in the concave notch of an
 * outline must not count as inside it — which is exactly what testing the
 * bounding box instead would get wrong.
 */
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

/* ===== The keyboard verbs ===== */

/**
 * The two nudge steps, in CANVAS pixels.
 *
 * Canvas space rather than screen space so a nudge means the same thing at
 * every zoom: a reader who moves a vertex one step at fit zoom and one step at
 * 8× has moved it the same distance across the folio, which is the distance the
 * annotation records. A step in screen pixels would shrink as the reader zoomed
 * in — the opposite of what precision work wants.
 *
 * One canvas pixel is the finest adjustment a canvas-space geometry can carry;
 * ten crosses a folio-sized canvas in a few hundred presses rather than a few
 * thousand.
 */
export const NUDGE_STEP_CANVAS_PX = 1;
export const NUDGE_LARGE_STEP_CANVAS_PX = 10;

/** Screen y grows downward, so `ArrowUp` is negative y. */
const NUDGE_DIRECTIONS: Record<string, Point> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
};

/**
 * The canvas-space delta an arrow key describes, or `null` for a key that is
 * not an arrow — which is what tells the caller to leave the event alone so it
 * reaches whatever else wants it.
 */
export function nudgeDelta(key: string, large: boolean): Point | null {
    const direction = NUDGE_DIRECTIONS[key];
    if (!direction) return null;
    const step = large ? NUDGE_LARGE_STEP_CANVAS_PX : NUDGE_STEP_CANVAS_PX;
    return { x: direction.x * step, y: direction.y * step };
}

export function translatePoint(point: Point, delta: Point): Point {
    return { x: point.x + delta.x, y: point.y + delta.y };
}

/**
 * How much of the visible box a keyboard-placed default shape spans.
 *
 * A fraction of the CURRENT view rather than a fixed canvas-space size: a
 * default shape has to be visible and grabbable at whatever zoom the reader is
 * at, and a fixed canvas extent is either a speck at fit zoom or larger than
 * the screen at 8×. The reader then sizes it with the ordinary nudge verbs,
 * which are in canvas space because they are adjustments to a stored geometry.
 */
export const DEFAULT_SHAPE_VIEW_FRACTION = 0.25;

/** The box of the given extent centred on a point. */
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

/**
 * The default triangle inscribed in a box: apex at the top edge's midpoint,
 * then the two bottom corners, winding clockwise on screen like
 * {@link ellipseVertices}.
 *
 * The polygon tool's keyboard start. Three vertices because that is the fewest
 * a region can have ({@link MIN_POLYGON_VERTICES}), so every vertex the reader
 * then adds is one they asked for.
 */
export function triangleVertices(rect: Rect): Point[] {
    const bottom = rect.y + rect.height;
    return [
        { x: rect.x + rect.width / 2, y: rect.y },
        { x: rect.x + rect.width, y: bottom },
        { x: rect.x, y: bottom },
    ];
}

/**
 * The same polygon with a vertex added just after `index`, at the midpoint of
 * the edge running from it to the next one — so the new vertex is on the
 * outline the reader can see, and lands at `index + 1`.
 *
 * The keyboard's counterpart to the pointer's insert, which takes the position
 * from where the reader double-clicked. A keyboard user has no such position,
 * so the edge's midpoint is the one unambiguous point on it.
 */
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

/* ===== Equality ===== */

/**
 * Whether two geometries name the same shape, so a commit can refuse to write
 * one that has not changed.
 *
 * Kinds never compare equal across each other: an edit cannot turn a rect into
 * a polygon, so a mismatch here is two different shapes rather than two
 * spellings of one.
 *
 * A point compares at whole canvas pixels, because that IS a point's geometry
 * — {@link canvasPixelPoint} is the only resolution a `PointSelector` is ever
 * written at (ADR 0004), and the raw projection of a pointer resting on a
 * stored point lands somewhere inside the pixel it already occupies. Rects and
 * polygons compare exactly, on the coordinates the caller holds.
 */
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
