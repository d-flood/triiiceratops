import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tests for TriiiceratopsViewer tile source extraction logic
 *
 * Covers:
 * - IIIF v2/v3 compatibility
 * - Multiple images per canvas (selects first)
 * - Service detection and info.json URL construction
 * - Fallback to heuristic IIIF URL parsing
 */

describe('TriiiceratopsViewer - Tile Sources', () => {
    /**
     * Extracted tile source logic from TriiiceratopsViewer.svelte
     */
    function extractTileSource(canvas: any) {
        // Use Manifesto to get images
        let images = canvas.getImages ? canvas.getImages() : null;

        // Fallback for IIIF v3: iterate content if images is empty
        if ((!images || !images.length) && canvas.getContent) {
            images = canvas.getContent();
        }

        if (!images || !images.length) {
            return null;
        }

        // Select first image
        const annotation = images[0];
        let resource = annotation.getResource ? annotation.getResource() : null;

        // v3 fallback: getBody
        if (!resource && annotation.getBody) {
            const body = annotation.getBody();
            if (Array.isArray(body) && body.length > 0) resource = body[0];
            else if (body) resource = body;
        }

        // Check if resource is valid
        const resourceJson = resource?.__jsonld || resource;
        const hasContent =
            resource &&
            (resource.id ||
                resource['@id'] ||
                (resourceJson &&
                    (resourceJson.service ||
                        resourceJson.id ||
                        resourceJson['@id'])));
        if (resource && !hasContent) {
            resource = null;
        }

        if (!resource) {
            // raw json fallback
            const json = annotation.__jsonld || annotation;
            if (json.body) {
                resource = Array.isArray(json.body) ? json.body[0] : json.body;
            }
        }

        if (!resource) {
            return null;
        }

        // Helper to normalize ID
        const getId = (thing: any) => thing.id || thing['@id'];

        // Start of service detection logic
        let services: any[] = [];
        const rJson = resource.__jsonld || resource;
        if (rJson.service) {
            services = Array.isArray(rJson.service)
                ? rJson.service
                : [rJson.service];
        }

        // Fallback to getServices() only if raw json didn't have services
        if (!services.length && resource.getServices) {
            services = resource.getServices();
        }

        if (services.length > 0) {
            // Find a valid image service
            const service = services.find((s: any) => {
                const type = s.getType
                    ? s.getType()
                    : s.type || s['@type'] || '';
                const profile = s.getProfile ? s.getProfile() : s.profile || '';
                return (
                    type === 'ImageService1' ||
                    type === 'ImageService2' ||
                    type === 'ImageService3' ||
                    (typeof profile === 'string' &&
                        profile.includes('http://iiif.io/api/image')) ||
                    (typeof profile === 'string' && profile === 'level0')
                );
            });

            if (service) {
                let id = getId(service);
                if (id && !id.endsWith('/info.json')) {
                    id = `${id}/info.json`;
                }
                return id;
            }
        }

        // Fallback: Heuristic from Image ID (if it looks like IIIF)
        const resourceId = getId(resource);
        if (resourceId && resourceId.includes('/iiif/')) {
            const parts = resourceId.split('/');
            const regionIndex = parts.findIndex(
                (p: string) => p === 'full' || p.match(/^\d+,\d+,\d+,\d+$/),
            );
            if (regionIndex > 0) {
                const base = parts.slice(0, regionIndex).join('/');
                return `${base}/info.json`;
            }
        }

        const url = resourceId;
        return { type: 'image', url };
    }

    describe('Multiple images per canvas', () => {
        it('should select first image when multiple images exist', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/image/first',
                            __jsonld: {
                                service: {
                                    id: 'http://example.org/iiif/first',
                                    type: 'ImageService3',
                                },
                            },
                        }),
                    },
                    {
                        getResource: () => ({
                            id: 'http://example.org/image/second',
                            __jsonld: {
                                service: {
                                    id: 'http://example.org/iiif/second',
                                    type: 'ImageService3',
                                },
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/first/info.json');
        });

        it('should handle empty images array', () => {
            const canvas = {
                getImages: () => [],
            };

            const result = extractTileSource(canvas);

            expect(result).toBeNull();
        });

        it('should handle null images', () => {
            const canvas = {
                getImages: () => null,
            };

            const result = extractTileSource(canvas);

            expect(result).toBeNull();
        });
    });

    describe('IIIF v2 compatibility (getImages)', () => {
        it('should extract service from v2 annotation resource', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            '@id': 'http://example.org/image/1',
                            __jsonld: {
                                service: {
                                    '@id': 'http://example.org/iiif/image1',
                                    '@type': 'ImageService2',
                                    profile:
                                        'http://iiif.io/api/image/2/level1.json',
                                },
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/image1/info.json');
        });

        it('should detect v2 ImageService2 type', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            '@id': 'http://example.org/image/v2',
                            __jsonld: {
                                service: {
                                    '@id': 'http://example.org/iiif/v2',
                                    '@type': 'ImageService2',
                                },
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/v2/info.json');
        });

        it('should use @id field for v2 resources', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            '@id': 'http://example.org/v2-image.jpg',
                            __jsonld: {},
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toEqual({
                type: 'image',
                url: 'http://example.org/v2-image.jpg',
            });
        });
    });

    describe('IIIF v3 compatibility (getContent)', () => {
        it('should fallback to getContent when getImages returns empty', () => {
            const canvas = {
                getImages: () => [],
                getContent: () => [
                    {
                        getBody: () => ({
                            id: 'http://example.org/image/v3',
                            __jsonld: {
                                service: {
                                    id: 'http://example.org/iiif/v3',
                                    type: 'ImageService3',
                                },
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/v3/info.json');
        });

        it('should fallback to getContent when getImages not available', () => {
            const canvas = {
                getImages: () => null,
                getContent: () => [
                    {
                        getBody: () => ({
                            id: 'http://example.org/image/v3',
                            __jsonld: {
                                service: {
                                    id: 'http://example.org/iiif/v3',
                                    type: 'ImageService3',
                                },
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/v3/info.json');
        });

        it('should detect v3 ImageService3 type', () => {
            const canvas = {
                getImages: () => [],
                getContent: () => [
                    {
                        getBody: () => ({
                            id: 'http://example.org/image/v3',
                            __jsonld: {
                                service: {
                                    id: 'http://example.org/iiif/v3-service',
                                    type: 'ImageService3',
                                },
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/v3-service/info.json');
        });

        it('should handle getBody returning array', () => {
            const canvas = {
                getImages: () => [],
                getContent: () => [
                    {
                        getBody: () => [
                            {
                                id: 'http://example.org/image/first',
                                __jsonld: {
                                    service: {
                                        id: 'http://example.org/iiif/first',
                                        type: 'ImageService3',
                                    },
                                },
                            },
                        ],
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/first/info.json');
        });

        it('should use id field for v3 resources', () => {
            const canvas = {
                getImages: () => [],
                getContent: () => [
                    {
                        getBody: () => ({
                            id: 'http://example.org/v3-image.jpg',
                            __jsonld: {},
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toEqual({
                type: 'image',
                url: 'http://example.org/v3-image.jpg',
            });
        });
    });

    describe('Service detection', () => {
        it('should detect ImageService1 type', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/image/1',
                            __jsonld: {
                                service: {
                                    id: 'http://example.org/iiif/v1',
                                    type: 'ImageService1',
                                },
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/v1/info.json');
        });

        it('should detect service by profile URL', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/image/1',
                            __jsonld: {
                                service: {
                                    id: 'http://example.org/iiif/byprofile',
                                    profile:
                                        'http://iiif.io/api/image/2/level2.json',
                                },
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/byprofile/info.json');
        });

        it('should detect level0 profile', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/image/1',
                            __jsonld: {
                                service: {
                                    id: 'http://example.org/iiif/level0',
                                    profile: 'level0',
                                },
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/level0/info.json');
        });

        it('should handle service arrays', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/image/1',
                            __jsonld: {
                                service: [
                                    {
                                        id: 'http://example.org/iiif/first',
                                        type: 'ImageService3',
                                    },
                                    {
                                        id: 'http://example.org/iiif/second',
                                        type: 'OtherService',
                                    },
                                ],
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            // Should use first valid image service
            expect(result).toBe('http://example.org/iiif/first/info.json');
        });

        it('should append info.json if not present', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/image/1',
                            __jsonld: {
                                service: {
                                    id: 'http://example.org/iiif/service',
                                    type: 'ImageService3',
                                },
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toContain('/info.json');
            expect(result).toBe('http://example.org/iiif/service/info.json');
        });

        it('should not append info.json if already present', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/image/1',
                            __jsonld: {
                                service: {
                                    id: 'http://example.org/iiif/service/info.json',
                                    type: 'ImageService3',
                                },
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/service/info.json');
        });
    });

    describe('IIIF URL heuristics', () => {
        it('should parse IIIF URL with /full/ region', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/iiif/image1/full/max/0/default.jpg',
                            __jsonld: {},
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/image1/info.json');
        });

        it('should parse IIIF URL with xywh region', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/iiif/image2/100,200,300,400/max/0/default.jpg',
                            __jsonld: {},
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/image2/info.json');
        });

        it('should not parse URLs without /iiif/ path', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/images/photo.jpg',
                            __jsonld: {},
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toEqual({
                type: 'image',
                url: 'http://example.org/images/photo.jpg',
            });
        });
    });

    describe('Raw JSON fallback', () => {
        it('should extract from __jsonld.body when methods fail', () => {
            const canvas = {
                getImages: () => [
                    {
                        __jsonld: {
                            body: {
                                id: 'http://example.org/raw-image.jpg',
                            },
                        },
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toEqual({
                type: 'image',
                url: 'http://example.org/raw-image.jpg',
            });
        });

        it('should handle body as array', () => {
            const canvas = {
                getImages: () => [
                    {
                        __jsonld: {
                            body: [
                                {
                                    id: 'http://example.org/raw-array-image.jpg',
                                },
                            ],
                        },
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toEqual({
                type: 'image',
                url: 'http://example.org/raw-array-image.jpg',
            });
        });

        it('should fallback to direct annotation body property', () => {
            const canvas = {
                getImages: () => [
                    {
                        body: {
                            id: 'http://example.org/direct-body.jpg',
                        },
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toEqual({
                type: 'image',
                url: 'http://example.org/direct-body.jpg',
            });
        });
    });

    describe('Resource validation', () => {
        it('should reject empty resource wrappers', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({}), // Empty object
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBeNull();
        });

        it('should accept resource with id', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            id: 'http://example.org/image.jpg',
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).not.toBeNull();
        });

        it('should accept resource with __jsonld containing service', () => {
            const canvas = {
                getImages: () => [
                    {
                        getResource: () => ({
                            __jsonld: {
                                id: 'http://example.org/image.jpg',
                                service: {
                                    id: 'http://example.org/iiif/service',
                                    type: 'ImageService3',
                                },
                            },
                        }),
                    },
                ],
            };

            const result = extractTileSource(canvas);

            expect(result).toBe('http://example.org/iiif/service/info.json');
        });
    });
});
