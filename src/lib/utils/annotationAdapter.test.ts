import { describe, it, expect } from 'vitest';
import { isFullCanvasAnnotation, parseAnnotation } from './annotationAdapter';

describe('annotationAdapter', () => {
    describe('parseAnnotation', () => {
        it('should correctly parse a simple xywh string target', () => {
            const annotation = {
                '@id': 'http://example.org/anno1',
                on: 'http://example.org/image1#xywh=10,20,100,200',
                label: 'Test Annotation',
            };

            const result = parseAnnotation(annotation, 0);

            expect(result).not.toBeNull();
            if (!result) return;

            expect(result.geometry.type).toBe('RECTANGLE');

            const geometry = result.geometry;
            if ('x' in geometry) {
                expect(geometry).toEqual({
                    type: 'RECTANGLE',
                    x: 10,
                    y: 20,
                    w: 100,
                    h: 200,
                });
            } else {
                throw new Error(
                    'Geometry should be RECTANGLE type with x, y, w, h',
                );
            }

            expect(result.coordinateSpace).toBe('image');
        });

        it('should extract SVG selector geometry', () => {
            const annotation = {
                '@id': 'http://example.org/anno2',
                on: {
                    selector: {
                        type: 'SvgSelector',
                        value: '<svg><polygon points="10,10 50,10 50,50 10,50" /></svg>',
                    },
                },
            };

            const result = parseAnnotation(annotation, 1);

            expect(result).not.toBeNull();
            if (!result) return;

            expect(result.geometry.type).toBe('POLYGON');

            const geometry = result.geometry;
            if ('points' in geometry) {
                expect(geometry.points).toHaveLength(4);
                expect(geometry.points).toEqual([
                    [10, 10],
                    [50, 10],
                    [50, 50],
                    [10, 50],
                ]);
            } else {
                throw new Error('Geometry should be POLYGON type with points');
            }
        });

        it('should handle Manifesto-style getTarget and getId methods', () => {
            const mockManifestoAnno = {
                getId: () => 'http://example.org/manifesto-anno',
                getTarget: () => 'http://example.org/canvas1#xywh=5,5,50,50',
                getBody: () => [
                    {
                        getValue: () => 'Manifesto Body',
                        getFormat: () => 'text/plain',
                    },
                ],
            };

            const result = parseAnnotation(mockManifestoAnno, 2);

            expect(result?.id).toBe('http://example.org/manifesto-anno');

            const geometry = result?.geometry;
            if (geometry && 'x' in geometry) {
                expect(geometry).toMatchObject({
                    type: 'RECTANGLE',
                    x: 5,
                    y: 5,
                    w: 50,
                    h: 50,
                });
            }

            expect(result?.body[0].value).toBe('Manifesto Body');
            expect(result?.coordinateSpace).toBe('image');
        });

        it('should return null for invalid annotations with no geometry', () => {
            const invalidAnno = {
                '@id': 'bad-anno',
                on: 'http://example.org/canvas1', // No media fragment or selector
            };

            const result = parseAnnotation(invalidAnno, 3);
            expect(result).toBeNull();
        });

        it('should fallback to a full-canvas rectangle for canvas-target annotations', () => {
            const annotation = {
                id: 'canvas-note',
                target: 'http://example.org/canvas1',
                body: {
                    type: 'TextualBody',
                    format: 'text/html',
                    value: '<p>Hello</p>',
                },
                __triiiceratopsCanvas: {
                    id: 'http://example.org/canvas1',
                    width: 800,
                    height: 600,
                },
            };

            const result = parseAnnotation(annotation, 4);

            expect(result).not.toBeNull();
            expect(result?.geometry).toEqual({
                type: 'RECTANGLE',
                x: 0,
                y: 0,
                w: 800,
                h: 600,
            });
            expect(result?.isFullCanvasTarget).toBe(true);
            expect(result?.coordinateSpace).toBe('canvas');
            expect(result?.body[0]).toMatchObject({
                value: '<p>Hello</p>',
                isHtml: true,
                format: 'text/html',
            });
        });

        it('should not treat fragment-target annotations as full-canvas', () => {
            const annotation = {
                id: 'fragment-note',
                target: 'http://example.org/canvas1#xywh=10,20,100,200',
                __triiiceratopsCanvas: {
                    id: 'http://example.org/canvas1',
                    width: 800,
                    height: 600,
                },
            };

            expect(isFullCanvasAnnotation(annotation)).toBe(false);
            expect(parseAnnotation(annotation, 6)?.isFullCanvasTarget).toBe(
                false,
            );
            expect(parseAnnotation(annotation, 6)?.coordinateSpace).toBe(
                'canvas',
            );
        });

        it('should extract PointSelector geometry', () => {
            const annotation = {
                id: 'point-note',
                target: {
                    type: 'SpecificResource',
                    source: 'http://example.org/canvas1',
                    selector: {
                        type: 'PointSelector',
                        x: 3385,
                        y: 1464,
                    },
                },
                body: {
                    type: 'TextualBody',
                    value: 'Town Creek Aqueduct',
                    format: 'text/plain',
                },
            };

            const result = parseAnnotation(annotation, 5);

            expect(result).not.toBeNull();
            expect(result?.geometry).toEqual({
                type: 'POINT',
                x: 3385,
                y: 1464,
            });
            expect(result?.body[0]).toMatchObject({
                value: 'Town Creek Aqueduct',
                format: 'text/plain',
            });
        });

        it('should keep image-target fragment annotations in image space', () => {
            const annotation = {
                id: 'image-fragment',
                target: 'http://example.org/image1#xywh=10,20,100,200',
                __triiiceratopsCanvas: {
                    id: 'http://example.org/canvas1',
                    width: 800,
                    height: 600,
                },
            };

            expect(parseAnnotation(annotation, 7)?.coordinateSpace).toBe(
                'image',
            );
        });

        it('should treat manifest annotations as image space by default', () => {
            const annotation = {
                id: 'manifest-fragment',
                target: 'http://example.org/canvas1#xywh=10,20,100,200',
                __triiiceratopsCanvas: {
                    id: 'http://example.org/canvas1',
                    width: 800,
                    height: 600,
                },
                __triiiceratopsAnnotationOrigin: 'manifest',
            };

            expect(parseAnnotation(annotation, 8)?.coordinateSpace).toBe(
                'image',
            );
        });

        it('should treat user annotations as canvas space by default', () => {
            const annotation = {
                id: 'user-fragment',
                target: 'http://example.org/canvas1#xywh=10,20,100,200',
                __triiiceratopsCanvas: {
                    id: 'http://example.org/canvas1',
                    width: 800,
                    height: 600,
                },
                __triiiceratopsAnnotationOrigin: 'user',
            };

            expect(parseAnnotation(annotation, 9)?.coordinateSpace).toBe(
                'canvas',
            );
        });
    });
});
