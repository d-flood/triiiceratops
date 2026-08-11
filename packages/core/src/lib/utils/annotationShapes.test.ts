import { describe, expect, it } from 'vitest';

import type { ParsedAnnotation } from './annotationAdapter';
import {
    projectAnnotationShapes,
    shapeContainsPoint,
    type AnnotationShape,
} from './annotationShapes';

/** A 2× canvas→screen mapping with a 100px offset, i.e. an ordinary viewport. */
const toScreen = (point: { x: number; y: number }) => ({
    x: point.x * 2 + 100,
    y: point.y * 2 + 100,
});

/** No canvas declares image dimensions of its own unless a test says so. */
const noImageDimensions = () => null;

function annotation(
    geometry: ParsedAnnotation['geometry'],
    overrides: Partial<ParsedAnnotation> = {},
): ParsedAnnotation {
    return {
        id: 'anno',
        renderId: 'anno::0',
        sourceAnnotationId: 'anno',
        geometryIndex: 0,
        geometry,
        coordinateSpace: 'canvas',
        canvasId: 'canvas-1',
        isFullCanvasTarget: false,
        body: [{ value: 'A note', isHtml: false }],
        isSearchHit: false,
        ...overrides,
    };
}

describe('projectAnnotationShapes', () => {
    it('projects a rectangle from both corners, so its size is the transform’s', () => {
        const [shape] = projectAnnotationShapes(
            [annotation({ type: 'RECTANGLE', x: 10, y: 20, w: 30, h: 40 })],
            { toScreen, imageDimensions: noImageDimensions },
        );

        expect(shape).toMatchObject({
            type: 'RECTANGLE',
            id: 'anno::0',
            annotationId: 'anno',
            tooltip: 'A note',
            rect: { x: 120, y: 140, width: 60, height: 80 },
        });
    });

    it('scales an image-space target into canvas space first', () => {
        // The canvas is half the image's size, so an image rect at 20,40 is a
        // canvas rect at 10,20 — and then the same 2× screen mapping applies.
        const [shape] = projectAnnotationShapes(
            [
                annotation(
                    { type: 'RECTANGLE', x: 20, y: 40, w: 60, h: 80 },
                    { coordinateSpace: 'image' },
                ),
            ],
            {
                toScreen,
                imageDimensions: () => ({
                    canvasWidth: 500,
                    canvasHeight: 400,
                    imageWidth: 1000,
                    imageHeight: 800,
                }),
            },
        );

        expect(shape).toMatchObject({
            rect: { x: 120, y: 140, width: 60, height: 80 },
        });
    });

    it('gives a polygon a bounding box and points relative to it', () => {
        const [shape] = projectAnnotationShapes(
            [
                annotation({
                    type: 'POLYGON',
                    points: [
                        [10, 10],
                        [30, 10],
                        [20, 30],
                    ],
                }),
            ],
            { toScreen, imageDimensions: noImageDimensions },
        );

        expect(shape).toMatchObject({
            type: 'POLYGON',
            bounds: { x: 120, y: 120, width: 40, height: 40 },
            points: [
                [0, 0],
                [40, 0],
                [20, 40],
            ],
        });
    });

    it('projects a point', () => {
        const [shape] = projectAnnotationShapes(
            [annotation({ type: 'POINT', x: 5, y: 15 })],
            { toScreen, imageDimensions: noImageDimensions },
        );

        expect(shape).toMatchObject({
            type: 'POINT',
            point: { x: 110, y: 130 },
        });
    });

    it('carries the search-hit and full-canvas flags the overlay branches on', () => {
        const [shape] = projectAnnotationShapes(
            [
                annotation(
                    { type: 'POINT', x: 0, y: 0 },
                    { isSearchHit: true, isFullCanvasTarget: true },
                ),
            ],
            { toScreen, imageDimensions: noImageDimensions },
        );

        expect(shape.isSearchHit).toBe(true);
        expect(shape.isFullCanvasTarget).toBe(true);
    });

    // A renderer that cannot place the canvas answers `null`, and a shape drawn
    // from a half-answer would sit somewhere wrong on the image — which is worse
    // than not being drawn, because it looks authoritative.
    it('drops a shape the renderer cannot place, including a partly placeable polygon', () => {
        const placeable = (point: { x: number; y: number }) =>
            point.x < 100 ? toScreen(point) : null;

        expect(
            projectAnnotationShapes(
                [
                    annotation({ type: 'POINT', x: 500, y: 0 }),
                    annotation({
                        type: 'POLYGON',
                        points: [
                            [10, 10],
                            [500, 10],
                        ],
                    }),
                    annotation({ type: 'RECTANGLE', x: 10, y: 10, w: 5, h: 5 }),
                ],
                { toScreen: placeable, imageDimensions: noImageDimensions },
            ).map((shape) => shape.type),
        ).toEqual(['RECTANGLE']);
    });
});

describe('shapeContainsPoint', () => {
    const rect: AnnotationShape = {
        type: 'RECTANGLE',
        canvasId: 'canvas-1',
        id: 'r',
        annotationId: 'r',
        isSearchHit: false,
        isFullCanvasTarget: false,
        tooltip: '',
        rect: { x: 10, y: 10, width: 20, height: 20 },
    };

    const point: AnnotationShape = {
        type: 'POINT',
        canvasId: 'canvas-1',
        id: 'p',
        annotationId: 'p',
        isSearchHit: false,
        isFullCanvasTarget: false,
        tooltip: '',
        point: { x: 50, y: 50 },
    };

    const triangle: AnnotationShape = {
        type: 'POLYGON',
        canvasId: 'canvas-1',
        id: 'g',
        annotationId: 'g',
        isSearchHit: false,
        isFullCanvasTarget: false,
        tooltip: '',
        bounds: { x: 100, y: 100, width: 40, height: 40 },
        points: [
            [0, 0],
            [40, 0],
            [20, 40],
        ],
    };

    it('tests a rectangle inclusively at its edges', () => {
        expect(shapeContainsPoint(rect, 20, 20, 12)).toBe(true);
        expect(shapeContainsPoint(rect, 10, 30, 12)).toBe(true);
        expect(shapeContainsPoint(rect, 9, 20, 12)).toBe(false);
    });

    it('tests a point marker as a circle of the marker’s own size', () => {
        expect(shapeContainsPoint(point, 53, 50, 12)).toBe(true);
        // Outside the 6px radius, though well inside the 20px one a larger
        // marker style would give it.
        expect(shapeContainsPoint(point, 58, 50, 12)).toBe(false);
        expect(shapeContainsPoint(point, 58, 50, 40)).toBe(true);
    });

    it('tests a polygon against its own outline, not its bounding box', () => {
        // Inside the box, outside the triangle: the top-left corner.
        expect(shapeContainsPoint(triangle, 102, 138, 12)).toBe(false);
        expect(shapeContainsPoint(triangle, 120, 120, 12)).toBe(true);
    });
});
