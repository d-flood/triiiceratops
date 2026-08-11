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
        // 16 megapixels, the shipped ceiling — stated here for the same reason.
        // This is the ONLY thing that refuses a ladder at this tier, so every
        // refusal assertion below is measured against a number the test owns.
        maxDecodedPixels: 16 * 1024 * 1024,
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

        it('clamps to the whole image rather than asking for an upscale', () => {
            // `512,` on a 400 px wide image is not a large picture, it is a
            // 400: Image API 3.0 requires the `^` prefix to upscale and 2.1
            // forbids it. Unclamped, a seal or a binding fragment burns both
            // attempts plus the `native` fallback and stays blank, with nothing
            // in `unresolvedThumbnails` to explain it.
            expect(resolve({ rung: 512, imageWidth: 400 })).toMatchObject({
                url: `${SERVICE}/full/max/0/default.jpg`,
            });
        });

        it('spells the whole image `full` on a version 2 service, fallback included', () => {
            expect(
                resolve({
                    source: service('http://iiif.io/api/image/2/level2.json'),
                    rung: 512,
                    imageWidth: 400,
                }),
            ).toEqual({
                kind: 'url',
                url: `${SERVICE}/full/full/0/default.jpg`,
                fallback: {
                    url: `${SERVICE}/full/full/0/native.jpg`,
                    group: SERVICE,
                },
            });
        });

        it('does not clamp a rung the image is comfortably wider than', () => {
            expect(resolve({ rung: 128, imageWidth: 4000 })).toMatchObject({
                url: `${SERVICE}/full/128,/0/default.jpg`,
            });
        });

        it('applies no clamp when the manifest declares no width', () => {
            // `null` is what an unsized Canvas carries, and the width-only form
            // is the only thing that can be said without one.
            expect(resolve({ rung: 128, imageWidth: null })).toMatchObject({
                url: `${SERVICE}/full/128,/0/default.jpg`,
            });
        });
    });

    describe('rung 3 — asking info.json, and only where it is needed', () => {
        it('uses the service id declared by info.json', () => {
            const signed = 'https://example.test/signed/abc';

            expect(
                resolve({
                    facts: {
                        requestBaseUri: signed,
                        width: 4000,
                        height: 3000,
                        version: 3,
                    },
                }),
            ).toMatchObject({ url: `${signed}/full/256,/0/default.jpg` });
        });

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

        it('clamps against the width `info.json` states, not the manifest’s guess', () => {
            const facts: ImageServiceFacts = {
                width: 300,
                height: 225,
                version: 3,
            };

            expect(
                resolve({
                    source: service(null),
                    facts,
                    rung: 512,
                    imageWidth: 4000,
                }),
            ).toMatchObject({ url: `${SERVICE}/full/max/0/default.jpg` });
        });
    });

    describe('rung 4 — the advertised scale factors, as whole images', () => {
        it('asks a level0 tile tree for the single tile that is the whole image', () => {
            const facts: ImageServiceFacts = {
                width: 1200,
                height: 900,
                level0: true,
                version: 3,
                tileSize: 256,
                scaleFactors: [1, 2, 4, 8],
            };

            // 1200/8 = 150, the coarsest level this pyramid describes and the
            // only one whose grid is 1x1 (at scale factor 4 the image is 300px
            // over 256px tiles, so two columns). It is requested as the TILE it
            // is — the same file the tile tier draws this canvas from — and not
            // as `full/150,`, which a static version 3 tree need not hold and
            // which the trees in the wild do not.
            expect(
                resolve({ source: service('level0'), facts, rung: 128 }),
            ).toMatchObject({
                url: `${SERVICE}/0,0,1200,900/150,113/0/default.jpg`,
            });
        });

        /**
         * A service advertising `sizes[]` **and** `tiles[]`, which the previous
         * either/or read as "sizes, therefore not tiles" — the shape CSNTM
         * publishes, and the one that put a working canvas on its error
         * placeholder for the whole zoomed-out band.
         */
        it('prefers the tile tree over sizes[] when a service advertises both', () => {
            const facts: ImageServiceFacts = {
                width: 6132,
                height: 8176,
                level0: true,
                version: 3,
                tileSize: 1024,
                scaleFactors: [32, 16, 8, 4, 2, 1],
                sizes: [
                    { width: 192, height: 256 },
                    { width: 384, height: 511 },
                    { width: 767, height: 1022 },
                    { width: 1533, height: 2044 },
                    { width: 3066, height: 4088 },
                    { width: 6132, height: 8176 },
                ],
            };

            // The three single-tile levels — 192, 384, 767 — each addressed as
            // its tile. The 1533 level is 2x2 and is not offered: this tier
            // paints one image and does not composite.
            for (const [rung, expected] of [
                [64, '0,0,6132,8176/192,256'],
                [256, '0,0,6132,8176/384,511'],
                [512, '0,0,6132,8176/767,1022'],
                // Past the largest single-tile level the ladder tops out rather
                // than reaching for a size it cannot fetch. Softness here, and
                // promotion to the tile tier just above it.
                [2048, '0,0,6132,8176/767,1022'],
            ] as const) {
                expect(
                    resolve({ source: service('level0'), facts, rung }),
                ).toMatchObject({
                    url: `${SERVICE}/${expected}/0/default.jpg`,
                });
            }
        });

        it('keeps version 2’s whole-image spelling, and carries no native fallback', () => {
            // The explicit region is a version 3 static-tree requirement and
            // `tileUrl` owns that judgement: a version 2 tree's whole-image file
            // is `full/{w},`, which is 2.x's own canonical form. So this rung is
            // spelled exactly as it was before — the fix is version 3 only.
            //
            // What it does lose is `rungFallback`'s second spelling (version 2's
            // deprecated `native` quality). Tile requests carry no fallback
            // either, so a tile that 404s answers the same way at both tiers.
            const facts: ImageServiceFacts = {
                width: 1200,
                height: 900,
                level0: true,
                version: 2,
                tileSize: 256,
                scaleFactors: [1, 2, 4, 8],
            };

            expect(
                resolve({ source: service('level0'), facts, rung: 128 }),
            ).toEqual({
                kind: 'url',
                url: `${SERVICE}/full/150,/0/default.jpg`,
            });
        });

        it('falls back to the advertised sizes when no level is a single tile', () => {
            // The coarsest level of a 12000px image over 256px tiles is still
            // three columns wide, so there is no whole-image tile to ask for and
            // this tier keeps the behaviour it shipped with.
            const facts: ImageServiceFacts = {
                width: 12_000,
                height: 9000,
                level0: true,
                version: 3,
                tileSize: 256,
                scaleFactors: [1, 2, 4, 8, 16],
                sizes: [{ width: 750, height: 563 }],
            };

            expect(
                resolve({ source: service('level0'), facts, rung: 64 }),
            ).toMatchObject({ url: `${SERVICE}/full/750,/0/default.jpg` });
        });
    });

    describe('rung 5 — nothing usable, permanently', () => {
        it('refuses a ladder whose cheapest image is over the decoded-pixel cap', () => {
            // A level0 service with no sizes and no tiles can serve exactly one
            // thing: the whole master. Decoding a 108-megapixel scan to fill a
            // 32-pixel box is the memory failure the tier exists to prevent, and
            // the spec's own answer for a canvas with no usable thumbnail is a
            // plain box (user story 31).
            const facts: ImageServiceFacts = {
                width: 12_000,
                height: 9000,
                level0: true,
                version: 3,
            };

            expect(
                resolve({ source: service('level0'), facts, rung: 32 }),
            ).toEqual({ kind: 'none' });
        });

        it('accepts an ordinary derivative set at the smallest rung', () => {
            // The boundary the refusal must NOT be drawn at. A Cantaloupe/IIP
            // derivative set off a 12000 px master is the common shape of a
            // level0 service, its cheapest image is 1.7 MB decoded, and refusing
            // it would put most real level0 manifests in the box tier — which is
            // the acceptance criterion "scrolling an 800-canvas manifest shows
            // page images, not empty boxes" failing on exactly the manifests it
            // was written for. The refusal is decoded pixels and nothing else.
            const facts: ImageServiceFacts = {
                width: 12_000,
                height: 9000,
                level0: true,
                version: 3,
                sizes: [
                    { width: 750, height: 563 },
                    { width: 1500, height: 1125 },
                    { width: 3000, height: 2250 },
                ],
            };

            expect(
                resolve({ source: service('level0'), facts, rung: 64 }),
            ).toMatchObject({
                kind: 'url',
                url: `${SERVICE}/full/750,/0/default.jpg`,
            });
        });

        it('accepts a scale-factor ladder off a large master at the smallest rung', () => {
            // The same shape reached through `ladderFromPyramid`: rungs 3 and 4
            // are the two that exist FOR level0, and both have to resolve.
            const facts: ImageServiceFacts = {
                width: 12_000,
                height: 9000,
                level0: true,
                version: 3,
                tileSize: 256,
                scaleFactors: [1, 2, 4, 8, 16],
            };

            expect(
                resolve({ source: service('level0'), facts, rung: 32 }),
            ).toMatchObject({
                kind: 'url',
                url: `${SERVICE}/full/750,/0/default.jpg`,
            });
        });

        it('is refused identically at every rung, so the tier cannot flip with zoom', () => {
            // "Box tier permanently, logged once" is only true if the answer is
            // independent of the zoom. A rung-relative threshold would accept
            // this canvas one zoom step in and refuse it one step out, with the
            // log entry claiming permanence either way.
            const facts: ImageServiceFacts = {
                width: 12_000,
                height: 9000,
                level0: true,
                version: 3,
            };

            for (const rung of THUMBNAIL_RUNGS) {
                expect(
                    resolve({ source: service('level0'), facts, rung }),
                ).toEqual({ kind: 'none' });
            }
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
            facts: { width: 12_000, height: 9000, level0: true },
            rung: 32,
            minPixelRatio: 0.5,
            maxDecodedPixels: 16 * 1024 * 1024,
        };

        // Same answer every frame, so a canvas that resolved to nothing keeps
        // resolving to nothing and no request is ever issued for it.
        expect(resolveThumbnail(input)).toEqual(resolveThumbnail(input));
        expect(resolveThumbnail(input)).toEqual({ kind: 'none' });
    });
});
