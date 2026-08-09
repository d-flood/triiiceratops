import { describe, it, expect } from 'vitest';
import {
    extractBody,
    isFullCanvasAnnotation,
    parseAnnotation,
    parseAnnotations,
} from './annotationAdapter';

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

        /**
         * A test named "should handle Manifesto-style getTarget and getId
         * methods" stood here. It built an annotation double carrying `getId`,
         * `getTarget` and `getBody` accessors and pinned the three
         * `manifesto.js`-shaped branches of `annotationAdapter.ts` that read
         * them. Nothing in the product ever hands those branches such an
         * object: every annotation reaching `parseAnnotation` comes from
         * `ManifestsState.manualGetAnnotations`, from a content-search
         * response, or from a plugin — raw JSON in all three cases. The test
         * asserted on the abstraction the `remove-manifesto` epic removes and
         * could not survive it, so it was dropped rather than migrated
         * (ticket 08). Ticket 10 deleted those branches; `extractBody` below
         * covers what replaced them, since this module is public API through
         * `triiiceratops/image-export`.
         */

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

        it('should expand multiple target fragments into multiple render entries', () => {
            const annotation = {
                id: 'multi-fragment',
                target: [
                    'http://example.org/canvas1#xywh=10,20,100,200',
                    'http://example.org/canvas1#xywh=30,40,50,60',
                    'http://example.org/canvas1#xywh=70,80,90,100',
                ],
                __triiiceratopsCanvas: {
                    id: 'http://example.org/canvas1',
                    width: 800,
                    height: 600,
                },
                __triiiceratopsAnnotationOrigin: 'manifest',
            };

            const parsed = parseAnnotations([annotation]);

            expect(parsed).toHaveLength(3);
            expect(parsed.map((entry) => entry.renderId)).toEqual([
                'multi-fragment::0',
                'multi-fragment::1',
                'multi-fragment::2',
            ]);
            expect(parsed.map((entry) => entry.sourceAnnotationId)).toEqual([
                'multi-fragment',
                'multi-fragment',
                'multi-fragment',
            ]);
            expect(parsed.map((entry) => entry.geometry)).toEqual([
                {
                    type: 'RECTANGLE',
                    x: 10,
                    y: 20,
                    w: 100,
                    h: 200,
                },
                {
                    type: 'RECTANGLE',
                    x: 30,
                    y: 40,
                    w: 50,
                    h: 60,
                },
                {
                    type: 'RECTANGLE',
                    x: 70,
                    y: 80,
                    w: 90,
                    h: 100,
                },
            ]);
            expect(parseAnnotation(annotation, 10)?.geometry).toEqual({
                type: 'RECTANGLE',
                x: 10,
                y: 20,
                w: 100,
                h: 200,
            });
        });

        it('should skip invalid targets while keeping valid multi-target entries', () => {
            const annotation = {
                id: 'mixed-fragment',
                target: [
                    'http://example.org/canvas1',
                    'http://example.org/canvas1#xywh=5,6,7,8',
                    { source: 'http://example.org/canvas1' },
                    'http://example.org/canvas1#xywh=10,11,12,13',
                ],
                __triiiceratopsCanvas: {
                    id: 'http://example.org/canvas1',
                    width: 800,
                    height: 600,
                },
                __triiiceratopsAnnotationOrigin: 'manifest',
            };

            const parsed = parseAnnotations([annotation]);

            expect(parsed).toHaveLength(2);
            expect(parsed.map((entry) => entry.geometry)).toEqual([
                {
                    type: 'RECTANGLE',
                    x: 5,
                    y: 6,
                    w: 7,
                    h: 8,
                },
                {
                    type: 'RECTANGLE',
                    x: 10,
                    y: 11,
                    w: 12,
                    h: 13,
                },
            ]);
        });
    });

    /**
     * `extractBody` is exported, and reaches consumers through
     * `triiiceratops/image-export`. Its `manifesto.js` half — an
     * `if (typeof annotation.getBody === 'function')` whose `else` held the
     * raw-JSON reads — was deleted in ticket 10, which promoted that `else`
     * to the whole function. These pin what a real annotation now produces.
     */
    describe('extractBody', () => {
        it('reads a IIIF v3 `body`', () => {
            expect(
                extractBody({
                    id: 'anno-v3',
                    body: {
                        type: 'TextualBody',
                        value: '<p>Hello</p>',
                        format: 'text/html',
                        purpose: 'commenting',
                    },
                }),
            ).toEqual([
                {
                    value: '<p>Hello</p>',
                    isHtml: true,
                    purpose: 'commenting',
                    format: 'text/html',
                },
            ]);
        });

        it('reads a IIIF v2 `resource`, including the `cnt:chars` spelling', () => {
            expect(
                extractBody({
                    '@id': 'anno-v2',
                    resource: {
                        '@type': 'cnt:ContentAsText',
                        'cnt:chars': 'Marginal note',
                        format: 'text/plain',
                    },
                }),
            ).toEqual([
                {
                    value: 'Marginal note',
                    isHtml: false,
                    purpose: undefined,
                    format: 'text/plain',
                },
            ]);
        });

        it('reads every entry of a multi-body annotation', () => {
            expect(
                extractBody({
                    id: 'anno-multi',
                    body: [
                        { type: 'TextualBody', value: 'one' },
                        { type: 'TextualBody', value: 'two' },
                    ],
                }).map((body) => body.value),
            ).toEqual(['one', 'two']);
        });

        /**
         * IIIF defaults `TextualBody` to `text/plain`, so only a declared
         * `format: "text/html"` may route a body through the rich-text path.
         * Per ADR 0005 the format decision changes how a body renders, never
         * whether it renders — every case below still yields a body.
         */
        describe('only a declared `text/html` format means rich text', () => {
            it('treats a `TextualBody` with no format as plain text', () => {
                expect(
                    extractBody({
                        id: 'anno-untyped-format',
                        body: {
                            type: 'TextualBody',
                            value: 'Plain transcription',
                        },
                    }),
                ).toEqual([
                    {
                        value: 'Plain transcription',
                        isHtml: false,
                        purpose: undefined,
                        format: undefined,
                    },
                ]);
            });

            it('treats a declared `text/html` body as rich text', () => {
                expect(
                    extractBody({
                        id: 'anno-html',
                        body: {
                            type: 'TextualBody',
                            value: '<p>Hello</p>',
                            format: 'text/html',
                        },
                    })[0],
                ).toMatchObject({ value: '<p>Hello</p>', isHtml: true });
            });

            it('treats an unrelated format as plain text', () => {
                expect(
                    extractBody({
                        id: 'anno-markdown',
                        body: {
                            type: 'TextualBody',
                            value: '**not markup**',
                            format: 'text/markdown',
                        },
                    })[0],
                ).toMatchObject({ value: '**not markup**', isHtml: false });
            });

            it('leaves markup-looking characters in a plain-text body alone', () => {
                const bodies = extractBody({
                    id: 'anno-angle-brackets',
                    body: {
                        type: 'TextualBody',
                        value: '<b>bold</b> & <i>italic</i>',
                    },
                });

                // The panel renders a non-HTML body as a Svelte text
                // expression, so the characters survive as characters.
                expect(bodies).toHaveLength(1);
                expect(bodies[0].value).toBe('<b>bold</b> & <i>italic</i>');
                expect(bodies[0].isHtml).toBe(false);
            });

            it('keeps a v2 `resource` with no format as plain text', () => {
                expect(
                    extractBody({
                        '@id': 'anno-v2-no-format',
                        resource: {
                            '@type': 'dctypes:Text',
                            chars: '<script>alert(1)</script>',
                        },
                    })[0],
                ).toMatchObject({
                    value: '<script>alert(1)</script>',
                    isHtml: false,
                });
            });
        });

        it('falls back to the annotation label, then to a placeholder', () => {
            expect(
                extractBody({ id: 'anno-label', label: 'Just a label' }),
            ).toEqual([
                { value: 'Just a label', isHtml: false, purpose: 'commenting' },
            ]);

            expect(extractBody({ id: 'anno-empty' })).toEqual([
                { value: 'Annotation', isHtml: false, purpose: 'commenting' },
            ]);
        });
    });
});
