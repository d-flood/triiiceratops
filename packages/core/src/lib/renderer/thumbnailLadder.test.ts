import { describe, expect, it } from 'vitest';

import {
    quantizeRung,
    resolveThumbnail,
    THUMBNAIL_RUNGS,
    type ResolveThumbnailInput,
} from './thumbnailLadder';
import type { ImageServiceFacts, SourceDescriptor } from './types';

const SERVICE = 'https://example.test/iiif/abc';

function service(profile: string | null = null): SourceDescriptor {
    return { kind: 'service', serviceId: SERVICE, profile };
}

function resolve(overrides: Partial<ResolveThumbnailInput> = {}) {
    return resolveThumbnail({
        source: service('level2'),
        rung: 256,
        // The pyramid's shipped value, and the one the deviation recorded for
        // ticket 06 is about. Stated here rather than imported so tuning the
        // default cannot silently rewrite what these assertions prove.
        minPixelRatio: 0.5,
        ...overrides,
    });
}

describe('quantizeRung', () => {
    it('rounds a projection UP to the next rung', () => {
        expect(quantizeRung(1)).toBe(32);
        expect(quantizeRung(32)).toBe(32);
        expect(quantizeRung(33)).toBe(64);
        expect(quantizeRung(200)).toBe(256);
        expect(quantizeRung(256)).toBe(256);
    });

    it('clamps at the top rung rather than growing without bound', () => {
        // Above this the canvas is about to be pyramid tier anyway, and a
        // thumbnail that keeps growing is a whole-image download by another
        // name.
        expect(quantizeRung(10_000)).toBe(
            THUMBNAIL_RUNGS[THUMBNAIL_RUNGS.length - 1],
        );
    });

    it('produces a SMALL set of distinct sizes across a continuous zoom', () => {
        // The decision the ticket exists to protect. Computing the exact
        // projected size is the naive implementation: every zoom step would
        // mint a fresh URL, every one would miss the HTTP cache, and a pinch
        // would generate a request per frame per canvas.
        const sizes = new Set<number>();
        for (let projected = 1; projected <= 1200; projected += 1) {
            sizes.add(quantizeRung(projected));
        }

        expect([...sizes].sort((a, b) => a - b)).toEqual([...THUMBNAIL_RUNGS]);
    });
});

describe('resolveThumbnail', () => {
    describe('rung 1 — the Canvas’s declared thumbnail', () => {
        it('uses the declared URL as-is, with the ladder ignored', () => {
            const declared = 'https://example.test/thumb.jpg';

            for (const rung of THUMBNAIL_RUNGS) {
                expect(resolve({ thumbnailUrl: declared, rung })).toEqual({
                    kind: 'url',
                    url: declared,
                });
            }
        });

        it('is preferred over a service that would need an info.json', () => {
            // The point of the rung: a level0 canvas with a declared thumbnail
            // costs NO discovery at all.
            expect(
                resolve({
                    thumbnailUrl: 'https://example.test/thumb.jpg',
                    source: service('level0'),
                }),
            ).toEqual({
                kind: 'url',
                url: 'https://example.test/thumb.jpg',
            });
        });

        it('is preferred even over facts already in hand', () => {
            expect(
                resolve({
                    thumbnailUrl: 'https://example.test/thumb.jpg',
                    facts: { width: 4000, height: 3000 },
                }),
            ).toMatchObject({ url: 'https://example.test/thumb.jpg' });
        });
    });

    describe('rung 2 — a level 1 or 2 profile, from manifest data alone', () => {
        it.each([
            ['level1', 'the bare version 3 token'],
            ['level2', 'the bare version 3 token'],
            ['http://iiif.io/api/image/2/level2.json', 'the version 2 URI'],
            [
                'http://library.stanford.edu/iiif/image-api/1.1/compliance.html#level2',
                'the version 1 fragment',
            ],
        ])('constructs a URL from %s (%s)', (profile) => {
            const resolved = resolve({ source: service(profile), rung: 128 });

            expect(resolved).toMatchObject({
                kind: 'url',
                url: `${SERVICE}/full/128,/0/default.jpg`,
            });
        });

        it('asks for the rung it was given, so a zoom reuses URLs', () => {
            expect(resolve({ rung: 64 })).toMatchObject({
                url: `${SERVICE}/full/64,/0/default.jpg`,
            });
            expect(resolve({ rung: 512 })).toMatchObject({
                url: `${SERVICE}/full/512,/0/default.jpg`,
            });
        });

        it('carries the `native` fallback for a version 2 service', () => {
            // The knowing deviation recorded for ticket 06: every version 2
            // service is asked for `default`, which is wrong only for a frozen
            // pre-2016 tree — and one request per broken service buys the
            // answer back for the whole service.
            expect(
                resolve({
                    source: service('http://iiif.io/api/image/2/level2.json'),
                    rung: 128,
                }),
            ).toEqual({
                kind: 'url',
                url: `${SERVICE}/full/128,/0/default.jpg`,
                fallback: {
                    url: `${SERVICE}/full/128,/0/native.jpg`,
                    group: SERVICE,
                },
            });
        });

        it('carries no fallback for a version 3 service, which never had `native`', () => {
            expect(resolve({ source: service('level2') })).not.toHaveProperty(
                'fallback',
            );
        });
    });

    describe('rung 3 — asking info.json, and only where it is needed', () => {
        it('asks for metadata when the profile is level0', () => {
            expect(resolve({ source: service('level0') })).toEqual({
                kind: 'metadata',
            });
        });

        it('asks for metadata when there is no profile at all', () => {
            // "We do not know what this service answers" is not the same as
            // "level 2". Constructing a region request against a level0 tree
            // would 404 every rung.
            expect(resolve({ source: service(null) })).toEqual({
                kind: 'metadata',
            });
        });

        it('takes the advertised size the shared minPixelRatio walk picks', () => {
            const facts: ImageServiceFacts = {
                width: 4000,
                height: 3000,
                level0: true,
                version: 3,
                sizes: [
                    { width: 250, height: 188 },
                    { width: 500, height: 375 },
                    { width: 1000, height: 750 },
                ],
            };

            // At rung 256 the walk accepts anything no wider than
            // `256 / 0.5 = 512`, and takes the LARGEST of those — 500, not the
            // 250 that "the nearest advertised image at or above what is
            // needed" would give. Deliberately the pyramid's rule (TRACKER,
            // ticket 06 deviation): one sharpness budget for both source kinds.
            expect(
                resolve({ source: service('level0'), facts, rung: 256 }),
            ).toEqual({
                kind: 'url',
                url: `${SERVICE}/full/500,/0/default.jpg`,
            });
        });

        it('drops to a smaller advertised size as the projection shrinks', () => {
            const facts: ImageServiceFacts = {
                width: 4000,
                height: 3000,
                level0: true,
                version: 3,
                sizes: [
                    { width: 125, height: 94 },
                    { width: 250, height: 188 },
                    { width: 500, height: 375 },
                ],
            };

            expect(
                resolve({ source: service('level0'), facts, rung: 64 }),
            ).toMatchObject({ url: `${SERVICE}/full/125,/0/default.jpg` });
        });

        it('takes the canonical whole-image spelling for the full-size rung', () => {
            const facts: ImageServiceFacts = {
                width: 400,
                height: 300,
                level0: true,
                version: 3,
                sizes: [{ width: 400, height: 300 }],
            };

            expect(
                resolve({ source: service('level0'), facts, rung: 512 }),
            ).toMatchObject({ url: `${SERVICE}/full/max/0/default.jpg` });
        });

        it('constructs a URL once facts say the service is not level0', () => {
            const facts: ImageServiceFacts = {
                width: 4000,
                height: 3000,
                version: 3,
                format: 'png',
                tileSize: 512,
            };

            expect(
                resolve({ source: service(null), facts, rung: 128 }),
            ).toEqual({
                kind: 'url',
                url: `${SERVICE}/full/128,/0/default.png`,
            });
        });
    });

    describe('rung 4 — the advertised scale factors, as whole images', () => {
        it('uses a level0 service’s scale-factor whole images when it advertises no sizes', () => {
            const facts: ImageServiceFacts = {
                width: 1200,
                height: 900,
                level0: true,
                version: 3,
                tileSize: 256,
                scaleFactors: [1, 2, 4, 8],
            };

            // 1200/8 = 150, the coarsest whole image this pyramid describes,
            // and the only one at or under `128 / 0.5`.
            expect(
                resolve({ source: service('level0'), facts, rung: 128 }),
            ).toMatchObject({ url: `${SERVICE}/full/150,/0/default.jpg` });
        });
    });

    describe('rung 5 — nothing usable, permanently', () => {
        it('refuses a ladder whose cheapest image is far bigger than the rung', () => {
            // A level0 service with no sizes and no tiles can serve exactly one
            // thing: the whole master. Decoding a 12-megapixel scan to fill a
            // 32-pixel box is the memory failure the tier exists to prevent, and
            // the spec's own answer for a canvas with no usable thumbnail is a
            // plain box (user story 31).
            const facts: ImageServiceFacts = {
                width: 4000,
                height: 3000,
                level0: true,
                version: 3,
            };

            expect(
                resolve({ source: service('level0'), facts, rung: 32 }),
            ).toEqual({ kind: 'none' });
        });

        it('refuses a service whose dimensions are unusable', () => {
            expect(
                resolve({
                    source: service('level0'),
                    facts: { width: 0, height: 0, level0: true },
                    rung: 128,
                }),
            ).toEqual({ kind: 'none' });
        });

        it('has no ladder for a static source, which is one fixed image', () => {
            expect(
                resolve({
                    source: {
                        kind: 'static',
                        url: 'https://example.test/x.jpg',
                    },
                }),
            ).toEqual({ kind: 'none' });
        });
    });

    it('is a pure function of its inputs, which is what makes "never retried" true', () => {
        const input: ResolveThumbnailInput = {
            source: service('level0'),
            facts: { width: 4000, height: 3000, level0: true },
            rung: 32,
            minPixelRatio: 0.5,
        };

        // Same answer every frame, so a canvas that resolved to nothing keeps
        // resolving to nothing and no request is ever issued for it.
        expect(resolveThumbnail(input)).toEqual(resolveThumbnail(input));
        expect(resolveThumbnail(input)).toEqual({ kind: 'none' });
    });
});
