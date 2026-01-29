import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockCanvas } from '../test/utils/mockManifesto';

/**
 * Tests for ThumbnailGallery thumbnail extraction logic
 *
 * Note: Since ThumbnailGallery is a Svelte component with runes, we test
 * the core thumbnail extraction logic by recreating it here.
 */

describe('ThumbnailGallery - Thumbnail extraction', () => {
    /**
     * Extracted thumbnail logic from ThumbnailGallery.svelte
     * This allows us to test the complex fallback logic independently
     */
    function extractThumbnail(canvas: any, index: number) {
        let src = '';
        try {
            if (canvas.getThumbnail) {
                const thumb = canvas.getThumbnail();
                if (thumb) {
                    src =
                        typeof thumb === 'string'
                            ? thumb
                            : thumb.id || thumb['@id'];
                }
            }
        } catch (e) {
            console.warn('Error getting thumbnail', e);
        }

        // Fallback to first image if no thumbnail service
        if (!src) {
            let images = canvas.getImages ? canvas.getImages() : null;

            // Fallback for IIIF v3: iterate content if images is empty
            if ((!images || !images.length) && canvas.getContent) {
                images = canvas.getContent();
            }

            if (images && images.length > 0) {
                const annotation = images[0];
                let resource = annotation.getResource
                    ? annotation.getResource()
                    : null;

                // v3 fallback: getBody
                if (!resource && annotation.getBody) {
                    const body = annotation.getBody();
                    if (Array.isArray(body) && body.length > 0)
                        resource = body[0];
                    else if (body) resource = body;
                }

                // Validate resource
                if (
                    resource &&
                    !resource.id &&
                    !resource.__jsonld &&
                    (!resource.getServices ||
                        resource.getServices().length === 0)
                ) {
                    resource = null;
                }

                // Raw json fallback
                if (!resource) {
                    const json = annotation.__jsonld || annotation;
                    if (json.body) {
                        resource = Array.isArray(json.body)
                            ? json.body[0]
                            : json.body;
                    }
                }

                if (resource) {
                    const getServices = () => {
                        let s: any[] = [];
                        if (resource.getServices) {
                            s = resource.getServices();
                        }
                        if (!s || s.length === 0) {
                            const rJson = resource.__jsonld || resource;
                            if (rJson.service) {
                                s = Array.isArray(rJson.service)
                                    ? rJson.service
                                    : [rJson.service];
                            }
                        }
                        return s;
                    };

                    const services = getServices();
                    let isLevel0 = false;
                    if (services.length > 0) {
                        const service = services[0];
                        let profile: any = '';
                        try {
                            profile = service.getProfile
                                ? service.getProfile()
                                : service.profile || '';
                            // Handle Manifesto profile object
                            if (typeof profile === 'object' && profile) {
                                profile =
                                    profile.value ||
                                    profile.id ||
                                    profile['@id'] ||
                                    JSON.stringify(profile);
                            }
                        } catch (e) {
                            // ignore
                        }

                        const pStr = String(profile ?? '').toLowerCase();
                        if (
                            pStr.includes('level0') ||
                            pStr.includes('level-0')
                        ) {
                            isLevel0 = true;
                        }

                        const serviceId = service.id || service['@id'];

                        if (!isLevel0) {
                            src = `${serviceId}/full/200,/0/default.jpg`;
                        }
                    }

                    if (!src) {
                        src = resource.id || resource['@id'];

                        // Fallback: check raw annotation body
                        if (!src) {
                            let rawBody: any = null;
                            if (
                                annotation.__jsonld &&
                                annotation.__jsonld.body
                            ) {
                                rawBody = annotation.__jsonld.body;
                            } else if (annotation.body) {
                                rawBody = annotation.body;
                            }

                            if (rawBody) {
                                const bodyObj = Array.isArray(rawBody)
                                    ? rawBody[0]
                                    : rawBody;
                                src = bodyObj.id || bodyObj['@id'];
                            }
                        }
                    }
                }
            }
        }

        const getLabel = () => {
            if (canvas.getLabel) {
                const label = canvas.getLabel();
                return label.length ? label[0].value : `Canvas ${index + 1}`;
            }
            return `Canvas ${index + 1}`;
        };

        return {
            id: canvas.id,
            label: getLabel(),
            src,
            index,
        };
    }

    describe('Direct thumbnail via getThumbnail()', () => {
        it('should extract thumbnail from getThumbnail() as string', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => 'http://example.org/thumb.jpg',
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe('http://example.org/thumb.jpg');
            expect(result.label).toBe('Page 1');
        });

        it('should extract thumbnail from getThumbnail() as object with id', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => ({
                    id: 'http://example.org/thumb-v3.jpg',
                    type: 'Image',
                }),
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe('http://example.org/thumb-v3.jpg');
        });

        it('should extract thumbnail from getThumbnail() as object with @id', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => ({
                    '@id': 'http://example.org/thumb-v2.jpg',
                    '@type': 'dctypes:Image',
                }),
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe('http://example.org/thumb-v2.jpg');
        });
    });

    describe('Fallback to image service (v2 getImages)', () => {
        it('should construct thumbnail URL from IIIF service', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/image/1',
                            getServices: () => [
                                {
                                    id: 'http://example.org/iiif/image1',
                                    '@id': 'http://example.org/iiif/image1',
                                    getProfile: () =>
                                        'http://iiif.io/api/image/2/level1.json',
                                },
                            ],
                        }),
                    },
                ],
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe(
                'http://example.org/iiif/image1/full/200,/0/default.jpg',
            );
        });

        it('should handle service from __jsonld when getServices not available', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => [
                    {
                        getResource: () => ({
                            __jsonld: {
                                service: {
                                    '@id': 'http://example.org/iiif/image2',
                                    profile:
                                        'http://iiif.io/api/image/2/level1.json',
                                },
                            },
                            getServices: () => [],
                        }),
                    },
                ],
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe(
                'http://example.org/iiif/image2/full/200,/0/default.jpg',
            );
        });

        it('should handle service array', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => [
                    {
                        getResource: () => ({
                            __jsonld: {
                                service: [
                                    {
                                        '@id': 'http://example.org/iiif/image3',
                                        profile:
                                            'http://iiif.io/api/image/2/level1.json',
                                    },
                                ],
                            },
                            getServices: () => [],
                        }),
                    },
                ],
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe(
                'http://example.org/iiif/image3/full/200,/0/default.jpg',
            );
        });

        it('should skip level0 services and use direct image URL', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/direct-image.jpg',
                            getServices: () => [
                                {
                                    id: 'http://example.org/iiif/level0',
                                    '@id': 'http://example.org/iiif/level0',
                                    profile:
                                        'http://iiif.io/api/image/2/level0.json',
                                },
                            ],
                        }),
                    },
                ],
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            // Should use direct image URL instead of constructing IIIF URL
            expect(result.src).toBe('http://example.org/direct-image.jpg');
        });
    });

    describe('Fallback to image content (v3 getContent)', () => {
        it('should use getContent when getImages returns empty', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => [],
                getContent: () => [
                    {
                        getBody: () => ({
                            id: 'http://example.org/image/v3',
                            getServices: () => [
                                {
                                    id: 'http://example.org/iiif/v3',
                                    type: 'ImageService3',
                                },
                            ],
                        }),
                    },
                ],
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe(
                'http://example.org/iiif/v3/full/200,/0/default.jpg',
            );
        });

        it('should handle getBody returning array', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => null,
                getContent: () => [
                    {
                        getBody: () => [
                            {
                                id: 'http://example.org/image/first',
                                getServices: () => [
                                    {
                                        id: 'http://example.org/iiif/first',
                                        type: 'ImageService3',
                                    },
                                ],
                            },
                            {
                                id: 'http://example.org/image/second',
                            },
                        ],
                    },
                ],
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            // Should use first image
            expect(result.src).toBe(
                'http://example.org/iiif/first/full/200,/0/default.jpg',
            );
        });
    });

    describe('Raw JSON fallback', () => {
        it('should extract from __jsonld.body when methods fail', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => [
                    {
                        __jsonld: {
                            body: {
                                id: 'http://example.org/raw-image.jpg',
                            },
                        },
                    },
                ],
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe('http://example.org/raw-image.jpg');
        });

        it('should handle body as array', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => [
                    {
                        __jsonld: {
                            body: [
                                {
                                    id: 'http://example.org/raw-image-1.jpg',
                                },
                            ],
                        },
                    },
                ],
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe('http://example.org/raw-image-1.jpg');
        });

        it('should use @id when id is not available', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => [
                    {
                        __jsonld: {
                            body: {
                                '@id': 'http://example.org/raw-v2-image.jpg',
                            },
                        },
                    },
                ],
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe('http://example.org/raw-v2-image.jpg');
        });
    });

    describe('Direct image URL fallback', () => {
        it('should use resource id when no service available', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/direct.jpg',
                            getServices: () => [],
                        }),
                    },
                ],
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe('http://example.org/direct.jpg');
        });

        it('should use resource @id when id not available', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => [
                    {
                        getResource: () => ({
                            '@id': 'http://example.org/direct-v2.jpg',
                            __jsonld: {}, // Add __jsonld to pass validation
                            getServices: () => [],
                        }),
                    },
                ],
                getLabel: () => [{ value: 'Page 1' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe('http://example.org/direct-v2.jpg');
        });
    });

    describe('Canvas label extraction', () => {
        it('should extract label from getLabel() array', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => 'http://example.org/thumb.jpg',
                getLabel: () => [{ value: 'My Custom Label' }],
            };

            const result = extractThumbnail(canvas, 5);

            expect(result.label).toBe('My Custom Label');
        });

        it('should default to "Canvas N" when label is empty', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => 'http://example.org/thumb.jpg',
                getLabel: () => [],
            };

            const result = extractThumbnail(canvas, 3);

            expect(result.label).toBe('Canvas 4'); // index + 1
        });

        it('should default to "Canvas N" when getLabel not available', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => 'http://example.org/thumb.jpg',
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.label).toBe('Canvas 1');
        });
    });

    describe('Empty canvas handling', () => {
        it('should handle canvas with no images', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => [],
                getLabel: () => [{ value: 'Empty Canvas' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe('');
            expect(result.label).toBe('Empty Canvas');
        });

        it('should handle canvas with null images', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => null,
                getImages: () => null,
                getLabel: () => [{ value: 'Null Images Canvas' }],
            };

            const result = extractThumbnail(canvas, 0);

            expect(result.src).toBe('');
        });

        it('should handle canvas with error in getThumbnail', () => {
            const canvas = {
                id: 'http://example.org/canvas/1',
                getThumbnail: () => {
                    throw new Error('Thumbnail error');
                },
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/fallback.jpg',
                            getServices: () => [],
                        }),
                    },
                ],
                getLabel: () => [{ value: 'Error Canvas' }],
            };

            // Mock console.warn to prevent test output pollution
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const result = extractThumbnail(canvas, 0);

            // Should fallback to image
            expect(result.src).toBe('http://example.org/fallback.jpg');

            warnSpy.mockRestore();
        });
    });
});
