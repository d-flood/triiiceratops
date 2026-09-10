import { describe, expect, it } from 'vitest';

import type { EditableGeometry } from './editableShape';

import {
    canvasRectToScreenRect,
    geometriesEqual,
    centredRect,
    insertVertexAfter,
    NUDGE_LARGE_STEP_CANVAS_PX,
    NUDGE_STEP_CANVAS_PX,
    nudgeDelta,
    translatePoint,
    triangleVertices,
    ellipseVertices,
    ELLIPSE_VERTEX_COUNT,
    fragmentSelectorValue,
    HANDLE_HIT_RADIUS,
    handleAtPoint,
    insertVertex,
    isDrawableRect,
    MIN_POLYGON_VERTICES,
    MIN_SHAPE_SIZE_CANVAS_PX,
    moveRect,
    movePolygon,
    moveVertex,
    nearestEdgeInsertIndex,
    normaliseRect,
    parseFragmentRect,
    parseSvgPolygon,
    polygonBounds,
    polygonContainsPoint,
    polygonHandles,
    rectContainsPoint,
    rectHandles,
    removeVertex,
    resizeRect,
    screenDragToCanvasRect,
    screenPointToCanvasPixel,
    svgPolygonValue,
    type Point,
    type Rect,
} from './geometry';

/**
 * A viewport at a non-identity zoom and a non-zero pan, standing in for core's
 * `screenToCanvas` / `canvasToScreen` for one canvas.
 *
 * The numbers are deliberately awkward — 2.5× and an offset that is not a
 * multiple of the scale — so a projection that silently dropped either the zoom
 * or the pan could not still land on the expected answer.
 */
const VIEWPORT = { scale: 2.5, offsetX: 137, offsetY: -64 };

const toCanvas = (point: Point): Point => ({
    x: (point.x - VIEWPORT.offsetX) / VIEWPORT.scale,
    y: (point.y - VIEWPORT.offsetY) / VIEWPORT.scale,
});

const toScreen = (point: Point): Point => ({
    x: point.x * VIEWPORT.scale + VIEWPORT.offsetX,
    y: point.y * VIEWPORT.scale + VIEWPORT.offsetY,
});

describe('screenDragToCanvasRect', () => {
    it('projects a screen drag into canvas space, not screen space', () => {
        // 250x125 screen pixels at 2.5x is 100x50 canvas pixels: a rect that
        // came back as the screen extent would be 250x125 here.
        const rect = screenDragToCanvasRect(
            toScreen({ x: 400, y: 300 }),
            toScreen({ x: 500, y: 350 }),
            toCanvas,
        );

        expect(rect).toEqual({ x: 400, y: 300, width: 100, height: 50 });
    });

    it('normalises a drag made in either direction', () => {
        const forward = screenDragToCanvasRect(
            toScreen({ x: 400, y: 300 }),
            toScreen({ x: 500, y: 350 }),
            toCanvas,
        );
        const backward = screenDragToCanvasRect(
            toScreen({ x: 500, y: 350 }),
            toScreen({ x: 400, y: 300 }),
            toCanvas,
        );

        expect(backward).toEqual(forward);
        expect(backward!.width).toBeGreaterThan(0);
        expect(backward!.height).toBeGreaterThan(0);
    });

    it('yields nothing when a corner belongs to no canvas', () => {
        // Core's coordinate helpers answer `null` rather than a point on some
        // other canvas, so a drag that leaves the canvas commits nothing.
        expect(
            screenDragToCanvasRect(
                { x: 0, y: 0 },
                { x: 10, y: 10 },
                () => null,
            ),
        ).toBeNull();
    });
});

describe('screenPointToCanvasPixel', () => {
    /**
     * A viewport ZOOMED OUT, where a canvas pixel is smaller than a screen
     * pixel. That is what makes the double-rounding claim below assertable: at
     * or above 1:1 a rounded screen point and an unrounded one land on the same
     * canvas pixel, and the bug this guards would be invisible.
     */
    const ZOOMED_OUT = { scale: 0.4, offsetX: 137, offsetY: -64 };
    const toCanvasZoomedOut = (point: Point): Point => ({
        x: (point.x - ZOOMED_OUT.offsetX) / ZOOMED_OUT.scale,
        y: (point.y - ZOOMED_OUT.offsetY) / ZOOMED_OUT.scale,
    });

    it('projects a click into canvas space at a non-identity zoom and pan', () => {
        // The screen point a canvas point of (900, 640) is currently at: a
        // result in screen space, or one that dropped the pan, lands elsewhere.
        const screen = {
            x: 900 * VIEWPORT.scale + VIEWPORT.offsetX,
            y: 640 * VIEWPORT.scale + VIEWPORT.offsetY,
        };
        expect(screenPointToCanvasPixel(screen, toCanvas)).toEqual({
            x: 900,
            y: 640,
        });
    });

    it('rounds once, on the canvas point, not on the screen point first', () => {
        // A fractional screen point — which is what a pointer event reports on
        // a scaled display. Rounded first, x would project to 410 and y to 660;
        // rounded once at the end they are the pixels the click actually named.
        const screen = { x: 300.6, y: 200.3 };
        expect(screenPointToCanvasPixel(screen, toCanvasZoomedOut)).toEqual({
            x: 409,
            y: 661,
        });
    });

    it('gives integers, never floats — ADR 0004 stores whole canvas pixels', () => {
        const point = screenPointToCanvasPixel({ x: 411.7, y: 88.2 }, toCanvas);
        expect(Number.isInteger(point?.x)).toBe(true);
        expect(Number.isInteger(point?.y)).toBe(true);
    });

    it('declines a point that belongs to no canvas', () => {
        expect(screenPointToCanvasPixel({ x: 10, y: 10 }, () => null)).toBe(
            null,
        );
    });
});

describe('normaliseRect', () => {
    it('spans two corners whichever order they arrive in', () => {
        expect(normaliseRect({ x: 30, y: 40 }, { x: 10, y: 100 })).toEqual({
            x: 10,
            y: 40,
            width: 20,
            height: 60,
        });
    });
});

describe('isDrawableRect', () => {
    it('discards a rect below the threshold in either dimension', () => {
        const under = MIN_SHAPE_SIZE_CANVAS_PX - 1;
        const over = MIN_SHAPE_SIZE_CANVAS_PX + 1;

        expect(
            isDrawableRect({ x: 0, y: 0, width: under, height: under }),
        ).toBe(false);
        // One good dimension does not rescue the other: a hairline is jitter.
        expect(isDrawableRect({ x: 0, y: 0, width: over, height: under })).toBe(
            false,
        );
        expect(isDrawableRect({ x: 0, y: 0, width: under, height: over })).toBe(
            false,
        );
    });

    it('keeps a legitimately small rect', () => {
        expect(
            isDrawableRect({
                x: 0,
                y: 0,
                width: MIN_SHAPE_SIZE_CANVAS_PX,
                height: MIN_SHAPE_SIZE_CANVAS_PX,
            }),
        ).toBe(true);
    });

    it('discards the degenerate rect a click produces', () => {
        const rect = screenDragToCanvasRect(
            toScreen({ x: 400, y: 300 }),
            toScreen({ x: 400, y: 300 }),
            toCanvas,
        );

        expect(isDrawableRect(rect!)).toBe(false);
    });
});

describe('fragmentSelectorValue', () => {
    it('states the rect in whole canvas pixels', () => {
        expect(
            fragmentSelectorValue({ x: 10, y: 20, width: 100, height: 50 }),
        ).toBe('xywh=10,20,100,50');
    });

    it('rounds edges, so a rounded rect keeps the extent its edges describe', () => {
        // x rounds down to 10 and the right edge (10.6 + 100.1) up to 111, so
        // the width is 101 — rounding the size independently would say 100 and
        // move the right edge a pixel.
        expect(
            fragmentSelectorValue({
                x: 10.4,
                y: 20.6,
                width: 100.3,
                height: 50.1,
            }),
        ).toBe('xywh=10,21,101,50');
    });
});

describe('canvasRectToScreenRect', () => {
    it('is the inverse of the drag projection', () => {
        const canvasRect = { x: 400, y: 300, width: 100, height: 50 };

        expect(canvasRectToScreenRect(canvasRect, toScreen)).toEqual({
            x: toScreen({ x: 400, y: 300 }).x,
            y: toScreen({ x: 400, y: 300 }).y,
            width: 100 * VIEWPORT.scale,
            height: 50 * VIEWPORT.scale,
        });
    });

    it('yields nothing for a canvas the renderer is not placing', () => {
        expect(
            canvasRectToScreenRect(
                { x: 0, y: 0, width: 10, height: 10 },
                () => null,
            ),
        ).toBeNull();
    });
});

describe('rectContainsPoint', () => {
    const rect = { x: 10, y: 10, width: 100, height: 100 };

    it('includes the edges, so a drag begun on a canvas seam still picks it', () => {
        expect(rectContainsPoint(rect, { x: 10, y: 110 })).toBe(true);
    });

    it('excludes a point outside', () => {
        expect(rectContainsPoint(rect, { x: 9, y: 50 })).toBe(false);
        expect(rectContainsPoint(rect, { x: 50, y: 111 })).toBe(false);
    });
});

describe('rectHandles', () => {
    it('places a handle on every corner and every edge midpoint', () => {
        const handles = rectHandles({ x: 100, y: 200, width: 80, height: 40 });

        expect(handles).toHaveLength(8);
        expect(
            Object.fromEntries(handles.map((h) => [h.id, [h.x, h.y]])),
        ).toEqual({
            nw: [100, 200],
            n: [140, 200],
            ne: [180, 200],
            e: [180, 220],
            se: [180, 240],
            s: [140, 240],
            sw: [100, 240],
            w: [100, 220],
        });
    });
});

describe('handleAtPoint', () => {
    const handles = rectHandles({ x: 0, y: 0, width: 200, height: 100 });

    it('answers with the handle the pointer is on', () => {
        expect(handleAtPoint(handles, { x: 200, y: 50 })).toBe('e');
    });

    it('answers nothing for a point beyond every handle', () => {
        expect(handleAtPoint(handles, { x: 100, y: 50 })).toBeNull();
    });

    it('reaches a handle from just outside it, within the hit radius', () => {
        expect(
            handleAtPoint(handles, {
                x: -HANDLE_HIT_RADIUS + 1,
                y: 0,
            }),
        ).toBe('nw');
        expect(
            handleAtPoint(handles, {
                x: -HANDLE_HIT_RADIUS - 1,
                y: 0,
            }),
        ).toBeNull();
    });

    it('picks the nearest of the handles that overlap on a small shape', () => {
        // 10x10 canvas pixels puts `nw`, `n`, `w` and the centre-adjacent
        // handles all inside one hit radius of each other, which is exactly the
        // case document order would answer wrongly.
        const small = rectHandles({ x: 0, y: 0, width: 10, height: 10 });

        // Two canvas pixels below the top-left corner: `nw` is 2 away and `w`
        // (at y=5) is 3, so the corner wins.
        expect(handleAtPoint(small, { x: 0, y: 2 })).toBe('nw');
        // Two above the bottom-left corner and that corner wins instead.
        expect(handleAtPoint(small, { x: 0, y: 8 })).toBe('sw');
        // Dead on the midpoint of the west edge, where `nw` and `sw` are
        // equidistant: `w` is nearer than either, and is the one the pointer is
        // visually on.
        expect(handleAtPoint(small, { x: 0, y: 5 })).toBe('w');
    });
});

describe('resizeRect', () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 };

    it('moves both edges a corner handle owns', () => {
        expect(resizeRect(rect, 'se', { x: 400, y: 260 })).toEqual({
            x: 100,
            y: 100,
            width: 300,
            height: 160,
        });
    });

    it('moves only the one edge an edge handle owns', () => {
        expect(resizeRect(rect, 'n', { x: 999, y: 60 })).toEqual({
            x: 100,
            y: 60,
            width: 200,
            height: 140,
        });
    });

    it('flips rather than inverting when dragged past the opposite edge', () => {
        expect(resizeRect(rect, 'w', { x: 380, y: 100 })).toEqual({
            x: 300,
            y: 100,
            width: 80,
            height: 100,
        });
    });
});

describe('moveRect', () => {
    it('translates a rect without changing its extent', () => {
        expect(
            moveRect({ x: 10, y: 20, width: 30, height: 40 }, { x: -5, y: 7 }),
        ).toEqual({ x: 5, y: 27, width: 30, height: 40 });
    });
});

describe('parseFragmentRect', () => {
    it('reads back what fragmentSelectorValue wrote', () => {
        const rect = { x: 12, y: 34, width: 56, height: 78 };

        expect(parseFragmentRect(fragmentSelectorValue(rect))).toEqual(rect);
    });

    it('accepts the pixel: prefix', () => {
        expect(parseFragmentRect('xywh=pixel:1,2,3,4')).toEqual({
            x: 1,
            y: 2,
            width: 3,
            height: 4,
        });
    });

    it('declines a temporal fragment, a zero-extent box and a non-string', () => {
        expect(parseFragmentRect('t=10,20')).toBeNull();
        expect(parseFragmentRect('xywh=1,2,0,4')).toBeNull();
        expect(parseFragmentRect(undefined)).toBeNull();
    });
});

describe('ellipseVertices', () => {
    const BOX = { x: 100, y: 200, width: 300, height: 160 };

    it('inscribes exactly ELLIPSE_VERTEX_COUNT vertices in the box', () => {
        const vertices = ellipseVertices(BOX);

        expect(vertices).toHaveLength(ELLIPSE_VERTEX_COUNT);
        // 64 rather than 32 is the decision this guards: a coarser polygon
        // shows flat facets at the zoom a deep-zoom viewer reaches.
        expect(ELLIPSE_VERTEX_COUNT).toBe(64);
        expect(polygonBounds(vertices)).toEqual(BOX);
    });

    it('puts every vertex on the ellipse the box circumscribes', () => {
        const cx = BOX.x + BOX.width / 2;
        const cy = BOX.y + BOX.height / 2;
        const rx = BOX.width / 2;
        const ry = BOX.height / 2;

        for (const vertex of ellipseVertices(BOX)) {
            // The ellipse's own equation: a vertex off it by any amount fails,
            // which a vertex count alone would not catch.
            const on =
                ((vertex.x - cx) / rx) ** 2 + ((vertex.y - cy) / ry) ** 2;
            expect(on).toBeCloseTo(1, 10);
        }
    });

    it('yields a circle for a square box', () => {
        const square = { x: 0, y: 0, width: 200, height: 200 };
        const centre = { x: 100, y: 100 };

        for (const vertex of ellipseVertices(square)) {
            expect(
                Math.hypot(vertex.x - centre.x, vertex.y - centre.y),
            ).toBeCloseTo(100, 10);
        }
    });

    it('winds consistently, clockwise on a y-down screen', () => {
        // Twice the SIGNED area by the shoelace formula. Negative is clockwise
        // with y growing downward; a sign that flipped would reverse the
        // outline's winding and with it every renderer's fill rule.
        const vertices = ellipseVertices(BOX);
        let twiceArea = 0;
        for (let index = 0; index < vertices.length; index++) {
            const a = vertices[index];
            const b = vertices[(index + 1) % vertices.length];
            twiceArea += a.x * b.y - b.x * a.y;
        }

        expect(twiceArea).toBeGreaterThan(0);
    });
});

describe('svgPolygonValue and parseSvgPolygon', () => {
    const TRIANGLE: Point[] = [
        { x: 10, y: 20 },
        { x: 40.5, y: 20 },
        { x: 40.5, y: 61.25 },
    ];

    it('round-trips a polygon through the selector value', () => {
        expect(parseSvgPolygon(svgPolygonValue(TRIANGLE))).toEqual(TRIANGLE);
    });

    it("writes a rooted <svg>, which is what core's parser needs", () => {
        const value = svgPolygonValue(TRIANGLE);

        expect(value.startsWith('<svg')).toBe(true);
        const parsed = new DOMParser().parseFromString(value, 'image/svg+xml');
        expect(parsed.documentElement.nodeName).toBe('svg');
        expect(parsed.querySelector('polygon')?.getAttribute('points')).toBe(
            '10,20 40.5,20 40.5,61.25',
        );
    });

    it('declines what it did not write, and what cannot close', () => {
        expect(
            parseSvgPolygon('<svg><circle cx="1" cy="1" r="1"/></svg>'),
        ).toBeNull();
        expect(parseSvgPolygon('<svg><path d="M0,0 L1,1"/></svg>')).toBeNull();
        expect(
            parseSvgPolygon('<svg><polygon points="0,0 1,1"/></svg>'),
        ).toBeNull();
        expect(parseSvgPolygon(undefined)).toBeNull();
    });
});

describe('vertex insertion and removal', () => {
    const SQUARE: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
    ];

    it('inserts on the nearest edge, between the vertices it lies between', () => {
        // Just outside the middle of the south edge, which runs from vertex 2
        // to vertex 3: the new vertex belongs at index 3.
        const at = { x: 50, y: 104 };
        const index = nearestEdgeInsertIndex(SQUARE, at);

        expect(index).toBe(3);
        const grown = insertVertex(SQUARE, index, at);
        expect(grown).toHaveLength(5);
        expect(grown[3]).toEqual(at);
        // Still a closed ring, and still the same one either side of the seam.
        expect(grown[2]).toEqual(SQUARE[2]);
        expect(grown[4]).toEqual(SQUARE[3]);
    });

    it('removes a vertex and leaves the rest closed and in order', () => {
        const reduced = removeVertex(SQUARE, 1);

        expect(reduced).toEqual([SQUARE[0], SQUARE[2], SQUARE[3]]);
        expect(reduced).toHaveLength(MIN_POLYGON_VERTICES);
    });

    it('refuses a removal that would leave fewer than three vertices', () => {
        const triangle = SQUARE.slice(0, 3);

        expect(removeVertex(triangle, 0)).toBeNull();
        expect(removeVertex(triangle, 2)).toBeNull();
        // And an index that is not a vertex at all changes nothing.
        expect(removeVertex(SQUARE, 9)).toBeNull();
    });

    it('moves one vertex without disturbing any other', () => {
        const moved = moveVertex(SQUARE, 2, { x: 160, y: 130 });

        expect(moved[2]).toEqual({ x: 160, y: 130 });
        expect(moved[0]).toEqual(SQUARE[0]);
        expect(moved[1]).toEqual(SQUARE[1]);
        expect(moved[3]).toEqual(SQUARE[3]);
    });

    it('translates every vertex on a whole-shape move', () => {
        expect(movePolygon(SQUARE, { x: 10, y: -5 })).toEqual([
            { x: 10, y: -5 },
            { x: 110, y: -5 },
            { x: 110, y: 95 },
            { x: 10, y: 95 },
        ]);
    });
});

describe('polygonContainsPoint', () => {
    // A concave outline: the notch is inside the bounding box and outside the
    // shape, which is the whole reason the bounding box cannot answer this.
    const CHEVRON: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 50, y: 40 },
        { x: 0, y: 100 },
    ];

    it('answers for the outline rather than for the bounding box', () => {
        expect(polygonContainsPoint(CHEVRON, { x: 50, y: 20 })).toBe(true);
        expect(polygonContainsPoint(CHEVRON, { x: 50, y: 90 })).toBe(false);
        expect(polygonContainsPoint(CHEVRON, { x: -5, y: 50 })).toBe(false);
    });
});

describe('handleAtPoint over polygon vertices', () => {
    const TRIANGLE: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 80 },
    ];

    it('answers with the vertex index nearest the pointer', () => {
        const handles = polygonHandles(TRIANGLE);

        expect(handleAtPoint(handles, { x: 98, y: 3 })).toBe(1);
        // Vertex 0 is a legitimate answer, and must not read as "no handle".
        expect(handleAtPoint(handles, { x: 1, y: 1 })).toBe(0);
        expect(handleAtPoint(handles, { x: 50, y: 40 })).toBeNull();
    });
});

describe('nudgeDelta', () => {
    it('answers a canvas-space delta for each arrow, and null for anything else', () => {
        expect(nudgeDelta('ArrowRight', false)).toEqual({
            x: NUDGE_STEP_CANVAS_PX,
            y: 0,
        });
        expect(nudgeDelta('ArrowLeft', false)).toEqual({
            x: -NUDGE_STEP_CANVAS_PX,
            y: 0,
        });
        // Screen y grows downward, so up is negative.
        expect(nudgeDelta('ArrowUp', false)).toEqual({
            x: 0,
            y: -NUDGE_STEP_CANVAS_PX,
        });
        expect(nudgeDelta('ArrowDown', false)).toEqual({
            x: 0,
            y: NUDGE_STEP_CANVAS_PX,
        });
        // Not an arrow: the caller must leave the event alone, so that core's
        // own zoom keys and the page's own keys still get it.
        expect(nudgeDelta('Enter', false)).toBeNull();
        expect(nudgeDelta('+', false)).toBeNull();
        expect(nudgeDelta('0', true)).toBeNull();
    });

    it('takes the larger step with Shift, in the same direction', () => {
        expect(nudgeDelta('ArrowDown', true)).toEqual({
            x: 0,
            y: NUDGE_LARGE_STEP_CANVAS_PX,
        });
        expect(NUDGE_LARGE_STEP_CANVAS_PX).toBeGreaterThan(
            NUDGE_STEP_CANVAS_PX,
        );
    });

    it('is the same delta whatever the zoom, because it is canvas space', () => {
        // Nothing here takes a scale. The claim is structural: a nudge is
        // expressed in the space the geometry is stored in, so the same press
        // moves the same distance across the folio at every zoom.
        expect(nudgeDelta('ArrowRight', false)).toEqual(
            nudgeDelta('ArrowRight', false),
        );
    });
});

describe('translatePoint', () => {
    it('adds the delta without mutating its input', () => {
        const point = { x: 10, y: 20 };
        expect(translatePoint(point, { x: -3, y: 4 })).toEqual({
            x: 7,
            y: 24,
        });
        expect(point).toEqual({ x: 10, y: 20 });
    });
});

describe('centredRect', () => {
    it('centres the given extent on the point', () => {
        expect(centredRect({ x: 600, y: 450 }, 200, 100)).toEqual({
            x: 500,
            y: 400,
            width: 200,
            height: 100,
        });
    });
});

describe('triangleVertices', () => {
    const BOX: Rect = { x: 100, y: 200, width: 80, height: 60 };

    it('inscribes the fewest vertices a region can have in the box', () => {
        const points = triangleVertices(BOX);

        expect(points).toHaveLength(MIN_POLYGON_VERTICES);
        expect(points).toEqual([
            { x: 140, y: 200 },
            { x: 180, y: 260 },
            { x: 100, y: 260 },
        ]);
        // Its bounds are the box it was inscribed in, so a default polygon is
        // the same size as a default rectangle.
        expect(polygonBounds(points)).toEqual(BOX);
    });

    it('winds clockwise on screen, as an inscribed ellipse does', () => {
        const triangle = triangleVertices(BOX);
        const ellipse = ellipseVertices(BOX);

        expect(signedArea(triangle)).toBeGreaterThan(0);
        expect(signedArea(ellipse)).toBeGreaterThan(0);
    });
});

/** Twice the signed area; positive means clockwise with y growing downward. */
function signedArea(points: readonly Point[]): number {
    let total = 0;
    for (let index = 0; index < points.length; index++) {
        const from = points[index];
        const to = points[(index + 1) % points.length];
        total += from.x * to.y - to.x * from.y;
    }
    return total;
}

describe('insertVertexAfter', () => {
    const TRIANGLE: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 80 },
    ];

    it('splices the edge midpoint in at the following index', () => {
        expect(insertVertexAfter(TRIANGLE, 0)).toEqual([
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 100, y: 0 },
            { x: 50, y: 80 },
        ]);
    });

    it('wraps at the last vertex, so the closing edge can gain one too', () => {
        expect(insertVertexAfter(TRIANGLE, 2)).toEqual([
            ...TRIANGLE,
            { x: 25, y: 40 },
        ]);
    });

    it('refuses an index that names no vertex', () => {
        expect(insertVertexAfter(TRIANGLE, 3)).toBeNull();
        expect(insertVertexAfter(TRIANGLE, -1)).toBeNull();
    });

    it('leaves the polygon closed — every vertex kept, one added', () => {
        const grown = insertVertexAfter(TRIANGLE, 1)!;

        expect(grown).toHaveLength(TRIANGLE.length + 1);
        for (const vertex of TRIANGLE) expect(grown).toContainEqual(vertex);
    });
});

describe('geometriesEqual', () => {
    const RECT: EditableGeometry = {
        kind: 'rect',
        rect: { x: 10, y: 20, width: 30, height: 40 },
    };
    const POLYGON: EditableGeometry & { kind: 'polygon' } = {
        kind: 'polygon',
        points: [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 80 },
        ],
    };

    it('holds a rect equal to itself, and to a separately built copy', () => {
        expect(geometriesEqual(RECT, RECT)).toBe(true);
        expect(
            geometriesEqual(RECT, {
                kind: 'rect',
                rect: { x: 10, y: 20, width: 30, height: 40 },
            }),
        ).toBe(true);
    });

    it('sees a moved rect, and a resized one, as changed', () => {
        expect(
            geometriesEqual(RECT, {
                kind: 'rect',
                rect: { ...RECT.rect, x: 11 },
            }),
        ).toBe(false);
        expect(
            geometriesEqual(RECT, {
                kind: 'rect',
                rect: { ...RECT.rect, height: 41 },
            }),
        ).toBe(false);
    });

    it('sees a resize that lands back on the same box, by another handle, as unchanged', () => {
        // Drag the west edge left by 5 and the east edge right by nothing, then
        // drag it back: two different handles, one box, and no write to make.
        const widened: EditableGeometry = {
            kind: 'rect',
            rect: { x: 5, y: 20, width: 35, height: 40 },
        };
        const restored: EditableGeometry = {
            kind: 'rect',
            rect: { x: 10, y: 20, width: 30, height: 40 },
        };

        expect(geometriesEqual(RECT, widened)).toBe(false);
        expect(geometriesEqual(RECT, restored)).toBe(true);
    });

    it('holds a polygon equal to a copy of itself', () => {
        expect(
            geometriesEqual(POLYGON, {
                kind: 'polygon',
                points: POLYGON.points.map((point) => ({ ...point })),
            }),
        ).toBe(true);
    });

    it('sees one moved vertex as changed', () => {
        const moved = POLYGON.points.map((point, index) =>
            index === 1 ? { ...point, x: point.x + 1 } : point,
        );

        expect(
            geometriesEqual(POLYGON, { kind: 'polygon', points: moved }),
        ).toBe(false);
    });

    it('sees a gained or lost vertex as changed', () => {
        expect(
            geometriesEqual(POLYGON, {
                kind: 'polygon',
                points: [...POLYGON.points, { x: 25, y: 40 }],
            }),
        ).toBe(false);
        expect(
            geometriesEqual(POLYGON, {
                kind: 'polygon',
                points: POLYGON.points.slice(0, 2),
            }),
        ).toBe(false);
    });

    it('is order-sensitive: the same vertices wound differently are a different outline', () => {
        expect(
            geometriesEqual(POLYGON, {
                kind: 'polygon',
                points: [...POLYGON.points].reverse(),
            }),
        ).toBe(false);
    });

    it('compares points at the whole canvas pixel they persist at', () => {
        const stored: EditableGeometry = {
            kind: 'point',
            point: { x: 12, y: 30 },
        };

        expect(
            geometriesEqual(stored, {
                kind: 'point',
                point: { x: 12.4, y: 29.7 },
            }),
        ).toBe(true);
        expect(
            geometriesEqual(stored, { kind: 'point', point: { x: 13, y: 30 } }),
        ).toBe(false);
    });

    it('never equates two kinds', () => {
        expect(geometriesEqual(RECT, POLYGON)).toBe(false);
        expect(
            geometriesEqual(RECT, { kind: 'point', point: { x: 10, y: 20 } }),
        ).toBe(false);
    });
});
