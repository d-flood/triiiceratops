import { describe, expect, it } from 'vitest';

import {
    editableShape,
    isCommittableGeometry,
    selectorForGeometry,
    withEditedGeometry,
    type EditableGeometry,
} from './editableShape';
import { MEDIA_FRAGMENT_CONFORMS_TO, parseSvgPolygon } from './geometry';
import type { W3CAnnotation } from './adapters/types';

const CANVAS = 'https://example.org/canvas/1';

function annotationWith(selector: unknown, extra = {}): W3CAnnotation {
    return {
        '@context': 'http://www.w3.org/ns/anno.jsonld',
        id: 'anno-1',
        type: 'Annotation',
        body: [],
        target: {
            type: 'SpecificResource',
            source: CANVAS,
            selector,
            ...extra,
        },
    } as W3CAnnotation;
}

const RECT_ANNOTATION = annotationWith({
    type: 'FragmentSelector',
    conformsTo: 'http://www.w3.org/TR/media-frags/',
    value: 'xywh=100,200,300,400',
});

const POLYGON_ANNOTATION = annotationWith({
    type: 'SvgSelector',
    value: '<svg xmlns="http://www.w3.org/2000/svg"><polygon points="10,20 40,20 40,60" /></svg>',
});

const POINT_ANNOTATION = annotationWith({ type: 'PointSelector', x: 5, y: 6 });

describe('editableShape', () => {
    it('reads the canvas and the canvas-space box off a fragment target', () => {
        expect(editableShape(RECT_ANNOTATION)).toEqual({
            canvasId: CANVAS,
            geometry: {
                kind: 'rect',
                rect: { x: 100, y: 200, width: 300, height: 400 },
            },
        });
    });

    it('reads the vertices off an SvgSelector polygon', () => {
        expect(editableShape(POLYGON_ANNOTATION)).toEqual({
            canvasId: CANVAS,
            geometry: {
                kind: 'polygon',
                points: [
                    { x: 10, y: 20 },
                    { x: 40, y: 20 },
                    { x: 40, y: 60 },
                ],
            },
        });
    });

    it('reads a point off a PointSelector', () => {
        expect(editableShape(POINT_ANNOTATION)).toEqual({
            canvasId: CANVAS,
            geometry: { kind: 'point', point: { x: 5, y: 6 } },
        });
    });

    it('declines the shapes this editor has no control points for', () => {
        // A whole-canvas target: no geometry at all, so nothing to put a
        // handle on, and opening it would suppress core's rendering of an
        // annotation this editor cannot draw.
        expect(editableShape(annotationWith(undefined))).toBeNull();
        // And a `PointSelector` whose coordinates are not numbers names no
        // point, however much it claims to be one.
        expect(
            editableShape(
                annotationWith({ type: 'PointSelector', x: 'a', y: 6 }),
            ),
        ).toBeNull();
    });

    it('declines an SVG shape it would have to rewrite as something else', () => {
        // Core APPROXIMATES a circle into points to draw it; this editor would
        // have to persist the approximation back, silently replacing the
        // author's shape with a coarser one.
        expect(
            editableShape(
                annotationWith({
                    type: 'SvgSelector',
                    value: '<svg><circle cx="10" cy="10" r="5" /></svg>',
                }),
            ),
        ).toBeNull();
    });

    it('declines a multi-target annotation, which has no single geometry', () => {
        const annotation = {
            ...RECT_ANNOTATION,
            target: [
                (RECT_ANNOTATION as { target: unknown }).target,
                (RECT_ANNOTATION as { target: unknown }).target,
            ],
        } as unknown as W3CAnnotation;

        expect(editableShape(annotation)).toBeNull();
    });
});

describe('withEditedGeometry', () => {
    it('replaces the geometry and nothing else', () => {
        const original = annotationWith(
            {
                type: 'FragmentSelector',
                conformsTo: 'http://www.w3.org/TR/media-frags/',
                value: 'xywh=100,200,300,400',
                'x-host-note': 'kept',
            },
            { 'x-host-target-field': 'kept too' },
        );
        original.body = [{ type: 'TextualBody', value: 'a note' }];

        const edited = withEditedGeometry(original, {
            kind: 'rect',
            rect: { x: 10, y: 20, width: 30, height: 40 },
        });

        expect(editableShape(edited)).toEqual({
            canvasId: CANVAS,
            geometry: {
                kind: 'rect',
                rect: { x: 10, y: 20, width: 30, height: 40 },
            },
        });
        expect(edited.body).toBe(original.body);
        expect(edited.target).toMatchObject({
            'x-host-target-field': 'kept too',
            selector: { 'x-host-note': 'kept' },
        });
    });

    it('writes an edited polygon back as an SvgSelector', () => {
        const edited = withEditedGeometry(POLYGON_ANNOTATION, {
            kind: 'polygon',
            points: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 50 },
                { x: 0, y: 50 },
            ],
        });

        expect(editableShape(edited)?.geometry).toEqual({
            kind: 'polygon',
            points: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 50 },
                { x: 0, y: 50 },
            ],
        });
    });

    it('never changes one selector kind into another', () => {
        // A rect geometry against a polygon target, and the reverse: a shape
        // that swapped representation on save would be a different annotation
        // to every reader of it, this editor's own included.
        expect(
            withEditedGeometry(POLYGON_ANNOTATION, {
                kind: 'rect',
                rect: { x: 0, y: 0, width: 1, height: 1 },
            }),
        ).toBe(POLYGON_ANNOTATION);
        expect(
            withEditedGeometry(RECT_ANNOTATION, {
                kind: 'polygon',
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 1, y: 1 },
                ],
            }),
        ).toBe(RECT_ANNOTATION);
    });

    it('writes a moved point back as integer coordinates', () => {
        // The drag hands over the raw projected canvas point; what is stored is
        // whole canvas pixels, because that is the only form ADR 0004 allows.
        const moved = withEditedGeometry(POINT_ANNOTATION, {
            kind: 'point',
            point: { x: 40.6, y: 12.4 },
        });

        expect((moved.target as { selector: unknown }).selector).toEqual({
            type: 'PointSelector',
            x: 41,
            y: 12,
        });
    });

    it('leaves an annotation it cannot read untouched', () => {
        expect(
            withEditedGeometry(POINT_ANNOTATION, {
                kind: 'rect',
                rect: { x: 0, y: 0, width: 1, height: 1 },
            }),
        ).toBe(POINT_ANNOTATION);
        expect(
            withEditedGeometry(RECT_ANNOTATION, {
                kind: 'point',
                point: { x: 1, y: 2 },
            }),
        ).toBe(RECT_ANNOTATION);
    });
});

describe('selectorForGeometry', () => {
    it('writes a box as a media fragment in whole canvas pixels', () => {
        expect(
            selectorForGeometry({
                kind: 'rect',
                rect: { x: 10.4, y: 20.6, width: 30.2, height: 40.1 },
            }),
        ).toEqual({
            type: 'FragmentSelector',
            conformsTo: MEDIA_FRAGMENT_CONFORMS_TO,
            value: 'xywh=10,21,31,40',
        });
    });

    it('writes an outline as an SvgSelector polygon', () => {
        const selector = selectorForGeometry({
            kind: 'polygon',
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 5, y: 8 },
            ],
        });

        expect(selector.type).toBe('SvgSelector');
        expect(parseSvgPolygon((selector as { value: string }).value)).toEqual([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 8 },
        ]);
    });

    it('writes a point as a PointSelector, rounded once', () => {
        expect(
            selectorForGeometry({ kind: 'point', point: { x: 12.7, y: 4.2 } }),
        ).toEqual({ type: 'PointSelector', x: 13, y: 4 });
    });

    it('round-trips through readGeometry for every kind', () => {
        // The write half and the read half agree, which is what lets one
        // annotation be created from the keyboard and reopened for editing.
        const geometries: EditableGeometry[] = [
            { kind: 'rect', rect: { x: 5, y: 6, width: 7, height: 8 } },
            {
                kind: 'polygon',
                points: [
                    { x: 1, y: 2 },
                    { x: 30, y: 4 },
                    { x: 15, y: 40 },
                ],
            },
            { kind: 'point', point: { x: 9, y: 11 } },
        ];

        for (const geometry of geometries) {
            const shape = editableShape(
                annotationWith(selectorForGeometry(geometry)),
            );
            expect(shape?.geometry).toEqual(geometry);
        }
    });
});

describe('isCommittableGeometry', () => {
    it('refuses a region below the minimum size, in either dimension', () => {
        expect(
            isCommittableGeometry({
                kind: 'rect',
                rect: { x: 0, y: 0, width: 2, height: 200 },
            }),
        ).toBe(false);
        expect(
            isCommittableGeometry({
                kind: 'rect',
                rect: { x: 0, y: 0, width: 200, height: 200 },
            }),
        ).toBe(true);
    });

    it('judges an outline by its bounding box', () => {
        expect(
            isCommittableGeometry({
                kind: 'polygon',
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 0, y: 1 },
                ],
            }),
        ).toBe(false);
    });

    it('exempts a point, which has no extent to judge', () => {
        expect(
            isCommittableGeometry({ kind: 'point', point: { x: 0, y: 0 } }),
        ).toBe(true);
    });
});
