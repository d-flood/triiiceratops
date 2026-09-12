import { describe, expect, it } from 'vitest';

import {
    buildSizeLadder,
    isLevel0Profile,
    ladderFromPyramid,
} from './sizeLadder';
import {
    buildPyramid,
    chooseLevel,
    exceedsDecodedPixelCap,
    tileRequest,
    tileUrl,
    type PyramidLevel,
} from './tilePyramid';
import type { ImageServiceFacts } from './types';

/** A level0 service advertising a geometric ladder including the full size. */
const SIZES_ONLY: ImageServiceFacts = {
    width: 4000,
    height: 3000,
    version: 3,
    sizes: [
        { width: 500, height: 375 },
        { width: 1000, height: 750 },
        { width: 4000, height: 3000 },
    ],
};

/** Effectively no cap, for tests that are not about the cap. */
const NO_CAP = Number.POSITIVE_INFINITY;

/** A ladder level, whose grid is 1x1 by construction. */
const whole = (
    level: Omit<PyramidLevel, 'columns' | 'rows'>,
): PyramidLevel => ({
    ...level,
    columns: 1,
    rows: 1,
});

describe('isLevel0Profile', () => {
    it('recognizes every spelling a manifest uses', () => {
        expect(isLevel0Profile('level0')).toBe(true);
        expect(isLevel0Profile('http://iiif.io/api/image/2/level0.json')).toBe(
            true,
        );
        expect(isLevel0Profile('https://iiif.io/api/image/3/level0.json')).toBe(
            true,
        );
        expect(
            isLevel0Profile(
                'http://library.stanford.edu/iiif/image-api/compliance.html#level0',
            ),
        ).toBe(true);
        // A v2 profile is often an array whose head is the compliance URI.
        expect(
            isLevel0Profile([
                'http://iiif.io/api/image/2/level0.json',
                { formats: ['jpg'] },
            ]),
        ).toBe(true);
    });

    it('reads the profile out of an object, however it is keyed', () => {
        expect(
            isLevel0Profile({
                '@id': 'http://iiif.io/api/image/2/level0.json',
            }),
        ).toBe(true);
        expect(
            isLevel0Profile({ id: 'http://iiif.io/api/image/2/level0.json' }),
        ).toBe(true);
        expect(isLevel0Profile({ value: 'level0' })).toBe(true);
        expect(
            isLevel0Profile({
                '@id': 'http://iiif.io/api/image/2/level2.json',
            }),
        ).toBe(false);
        expect(isLevel0Profile({ formats: ['jpg'] })).toBe(false);
    });

    it('finds the compliance URI at any position in an array', () => {
        expect(
            isLevel0Profile([
                { formats: ['jpg'] },
                'http://iiif.io/api/image/2/level0.json',
            ]),
        ).toBe(true);
        expect(
            isLevel0Profile([
                { formats: ['jpg'] },
                'http://iiif.io/api/image/2/level2.json',
            ]),
        ).toBe(false);
    });

    it('ignores case and a trailing fragment or query on the URI', () => {
        expect(isLevel0Profile('LEVEL0')).toBe(true);
        expect(isLevel0Profile('http://iiif.io/api/image/2/LEVEL0.json')).toBe(
            true,
        );
        expect(
            isLevel0Profile('http://iiif.io/api/image/2/level0.json#frag'),
        ).toBe(true);
        expect(
            isLevel0Profile('http://iiif.io/api/image/2/level0.json?v=2'),
        ).toBe(true);
    });

    it('does not mistake a higher compliance level for level0', () => {
        expect(isLevel0Profile('level2')).toBe(false);
        expect(isLevel0Profile('http://iiif.io/api/image/2/level1.json')).toBe(
            false,
        );
        expect(isLevel0Profile(undefined)).toBe(false);
        expect(isLevel0Profile(null)).toBe(false);
    });

    it('reads level0 only where it is the declared level, not anywhere in the path', () => {
        // The bug the shared classifier exists to fix: a substring test read
        // this level2 service as level0 because of its path segment.
        expect(
            isLevel0Profile(
                'https://example.org/level0-compat/api/image/2/level2.json',
            ),
        ).toBe(false);
    });

    it('treats `level-0` as undeclared rather than level0', () => {
        // Not a spelling any Image API version defines; no server emits it.
        expect(isLevel0Profile('level-0')).toBe(false);
    });
});

describe('buildSizeLadder', () => {
    it('uses the service id declared by info.json', () => {
        const signed = 'https://ex.org/signed/img';
        const ladder = buildSizeLadder('https://ex.org/img', {
            ...SIZES_ONLY,
            requestBaseUri: signed,
        })!;

        expect(tileUrl(ladder, ladder.levels[0], 0, 0)).toBe(
            `${signed}/full/500,/0/default.jpg`,
        );
    });

    it('orders the advertised sizes smallest first and scales each to the image', () => {
        const ladder = buildSizeLadder('https://ex.org/img', {
            ...SIZES_ONLY,
            // Deliberately out of order: `sizes` has no required ordering.
            sizes: [
                { width: 4000, height: 3000 },
                { width: 500, height: 375 },
                { width: 1000, height: 750 },
            ],
        })!;

        // Every level holds one tile: a size ladder IS a pyramid whose grid is
        // 1x1 at every level (`tilePyramid` §One level model).
        expect(ladder.levels).toEqual([
            whole({ level: 0, width: 500, height: 375, scaleFactor: 8 }),
            whole({ level: 1, width: 1000, height: 750, scaleFactor: 4 }),
            whole({ level: 2, width: 4000, height: 3000, scaleFactor: 1 }),
        ]);
        expect(ladder.width).toBe(4000);
        expect(ladder.height).toBe(3000);
    });

    it('drops duplicates and sizes larger than the image itself', () => {
        const ladder = buildSizeLadder('https://ex.org/img', {
            ...SIZES_ONLY,
            sizes: [
                { width: 500, height: 375 },
                { width: 500, height: 375 },
                { width: 8000, height: 6000 },
                { width: 4000, height: 3000 },
            ],
        })!;

        expect(ladder.levels.map((level) => level.width)).toEqual([500, 4000]);
    });

    it('keeps two derivatives that share a width but not a height', () => {
        // A service can generate both a fit-to-width and a fit-to-height
        // derivative. They are two files, and the export ladder
        // (`imageExport`) already keys on both dimensions — dropping one here
        // would make the offered sizes and the requested sizes different lists.
        const ladder = buildSizeLadder('https://ex.org/img', {
            ...SIZES_ONLY,
            sizes: [
                { width: 1000, height: 750 },
                { width: 1000, height: 563 },
                { width: 1000, height: 750 },
            ],
        })!;

        expect(ladder.levels.map((level) => level.height)).toEqual([750, 563]);
    });

    it('gives a service advertising no sizes at all a single full-image rung', () => {
        // Level0 compliance guarantees the full-size image at the canonical
        // whole-image URL, so this rung always exists. The alternative is a
        // permanently blank canvas.
        const ladder = buildSizeLadder('https://ex.org/img', {
            width: 800,
            height: 1000,
            version: 3,
        })!;

        expect(ladder.levels).toEqual([
            whole({ level: 0, width: 800, height: 1000, scaleFactor: 1 }),
        ]);
    });

    it('refuses a service with no usable dimensions', () => {
        expect(
            buildSizeLadder('https://ex.org/img', {
                width: 0,
                height: 1000,
                version: 3,
            }),
        ).toBeNull();
    });
});

describe('a size ladder`s request URL', () => {
    it('asks for a whole image at the advertised width, never a region', () => {
        const ladder = buildSizeLadder('https://ex.org/img', SIZES_ONLY)!;

        expect(tileUrl(ladder, ladder.levels[0], 0, 0)).toBe(
            'https://ex.org/img/full/500,/0/default.jpg',
        );
        expect(tileUrl(ladder, ladder.levels[1], 0, 0)).toBe(
            'https://ex.org/img/full/1000,/0/default.jpg',
        );
    });

    it('spells the full-resolution rung `max` in version 3 and `full` in version 2', () => {
        const v3 = buildSizeLadder('https://ex.org/img', SIZES_ONLY)!;
        const v2 = buildSizeLadder('https://ex.org/img', {
            ...SIZES_ONLY,
            version: 2,
        })!;

        expect(tileUrl(v3, v3.levels[2], 0, 0)).toBe(
            'https://ex.org/img/full/max/0/default.jpg',
        );
        expect(tileUrl(v2, v2.levels[2], 0, 0)).toBe(
            'https://ex.org/img/full/full/0/default.jpg',
        );
    });

    it('uses the service`s preferred format', () => {
        const ladder = buildSizeLadder('https://ex.org/img', {
            ...SIZES_ONLY,
            format: 'png',
        })!;

        expect(tileUrl(ladder, ladder.levels[0], 0, 0)).toBe(
            'https://ex.org/img/full/500,/0/default.png',
        );
    });

    it('does not call the largest advertised size `max` when it is not the full image', () => {
        // The previous renderer adopted the largest advertised size AS the
        // image dimensions, so it asked this service for `full/full` and got
        // back the 4000px original it could not decode. The advertised width is
        // the only honest request.
        const ladder = buildSizeLadder('https://ex.org/img', {
            ...SIZES_ONLY,
            sizes: [
                { width: 500, height: 375 },
                { width: 1000, height: 750 },
            ],
        })!;

        expect(tileUrl(ladder, ladder.levels[1], 0, 0)).toBe(
            'https://ex.org/img/full/1000,/0/default.jpg',
        );
    });
});

describe('chooseLevel, on a size ladder', () => {
    const ladder = buildSizeLadder('https://ex.org/img', SIZES_ONLY)!;

    /** `imageScale` for a level drawn 1:1 at `deviceWidth` device pixels. */
    const scaleFor = (deviceWidth: number) => deviceWidth / ladder.width;

    it('promotes as the projection grows, and only to advertised sizes', () => {
        // The `minPixelRatio` walk (see `tilePyramid.chooseLevel`): the finest
        // rung whose device-pixels-per-rung-pixel is at or above the ratio. At
        // 0.5 that is the largest rung no wider than twice what is needed.
        expect(chooseLevel(ladder, scaleFor(200), 0.5, NO_CAP).width).toBe(500);
        expect(chooseLevel(ladder, scaleFor(600), 0.5, NO_CAP).width).toBe(
            1000,
        );
        expect(chooseLevel(ladder, scaleFor(3000), 0.5, NO_CAP).width).toBe(
            4000,
        );

        for (const deviceWidth of [1, 10, 137, 800, 2500, 9000]) {
            expect(ladder.levels.map((level) => level.width)).toContain(
                chooseLevel(ladder, scaleFor(deviceWidth), 0.5, NO_CAP).width,
            );
        }
    });

    it('falls back to the coarsest rung rather than to nothing', () => {
        expect(chooseLevel(ladder, scaleFor(1), 0.5, NO_CAP).width).toBe(500);
    });

    it('refuses to promote past the decoded-pixel cap', () => {
        // 4000x3000 is 12 megapixels — 48 MB decoded. Capped at 1 megapixel,
        // deep zoom settles for the 1000px rung and accepts the blur.
        expect(chooseLevel(ladder, scaleFor(4000), 0.5, 1_000_000).width).toBe(
            1000,
        );
        // Uncapped, the same view takes the largest rung.
        expect(chooseLevel(ladder, scaleFor(4000), 0.5, NO_CAP).width).toBe(
            4000,
        );
    });

    it('still returns the cheapest rung when every rung is over the cap', () => {
        expect(chooseLevel(ladder, scaleFor(4000), 0.5, 1).width).toBe(500);
    });

    it('cuts the chain at the first rung over the cap, not at every one over it', () => {
        // `sizes[]` has no required ordering by AREA. A tall narrow derivative
        // can sit below a square one, so "every rung under the cap" is a gapped
        // set — and `planScene.planPyramid` requires the whole chain below the
        // chosen level, which would pull the refused image back in anyway.
        const gapped = buildSizeLadder('https://ex.org/img', {
            width: 8000,
            height: 8000,
            version: 3,
            sizes: [
                // 6.4 megapixels: over a 2 megapixel cap.
                { width: 800, height: 8000 },
                // 1 megapixel: under it, but only reachable through the rung
                // above.
                { width: 1000, height: 1000 },
            ],
        })!;

        const chosen = chooseLevel(gapped, 1, 0.5, 2 * 1024 * 1024);
        expect(chosen.width).toBe(800);
        expect(chosen.level).toBe(0);
    });

    it('takes a blurrier rung as `minPixelRatio` rises', () => {
        expect(chooseLevel(ladder, scaleFor(900), 0.5, NO_CAP).width).toBe(
            1000,
        );
        expect(chooseLevel(ladder, scaleFor(900), 2, NO_CAP).width).toBe(500);
    });
});

describe('exceedsDecodedPixelCap', () => {
    it('is how the cap`s one unavoidable override becomes diagnosable', () => {
        // Below every rung there is nothing coarser to fall back to, so
        // `chooseLevel` draws the cheapest image anyway rather than nothing.
        // That is a budget overrun, and the planner reports it.
        const ladder = buildSizeLadder('https://ex.org/img', SIZES_ONLY)!;

        expect(exceedsDecodedPixelCap(ladder, 1)).toBe(true);
        expect(chooseLevel(ladder, 1, 0.5, 1).width).toBe(500);

        expect(exceedsDecodedPixelCap(ladder, 1_000_000)).toBe(false);
    });
});

describe('the `native` fallback', () => {
    it('offers `native` for a version 2 service and nothing for a version 3 one', () => {
        const v2 = buildSizeLadder('https://ex.org/img', {
            ...SIZES_ONLY,
            version: 2,
        })!;
        const v3 = buildSizeLadder('https://ex.org/img', SIZES_ONLY)!;

        // The happy path is still `default` everywhere — this is only ever
        // reached from a failure, and one answer serves the whole service.
        expect(tileUrl(v2, v2.levels[0], 0, 0)).toBe(
            'https://ex.org/img/full/500,/0/default.jpg',
        );
        expect(tileRequest(v2, v2.levels[0], 0, 0).fallback).toEqual({
            url: 'https://ex.org/img/full/500,/0/native.jpg',
            group: 'https://ex.org/img',
        });

        expect(tileRequest(v3, v3.levels[0], 0, 0).fallback).toBeNull();
    });
});

describe('ladderFromPyramid', () => {
    it('reads a tiled service`s levels as whole images', () => {
        const pyramid = buildPyramid('https://ex.org/img', {
            width: 1200,
            height: 900,
            version: 3,
            tileSize: 256,
            scaleFactors: [1, 2, 4, 8],
            format: 'png',
        })!;

        const ladder = ladderFromPyramid(pyramid);

        expect(ladder.levels).toEqual([
            whole({ level: 0, width: 150, height: 113, scaleFactor: 8 }),
            whole({ level: 1, width: 300, height: 225, scaleFactor: 4 }),
            whole({ level: 2, width: 600, height: 450, scaleFactor: 2 }),
            whole({ level: 3, width: 1200, height: 900, scaleFactor: 1 }),
        ]);
        expect(tileUrl(ladder, ladder.levels[0], 0, 0)).toBe(
            'https://ex.org/img/full/150,/0/default.png',
        );
        expect(tileUrl(ladder, ladder.levels[3], 0, 0)).toBe(
            'https://ex.org/img/full/max/0/default.png',
        );
    });
});

describe('the level0 request set, by shape and by version', () => {
    /**
     * Both level0 shapes, in both Image API versions, as one table.
     *
     * The four rows are the whole of what the one level model has to keep
     * distinct: a ladder spells its top level canonically (`max` / `full`) and
     * carries `native` only in version 2; a tile tree spells its whole-image
     * tile `{w},{h}` with the explicit region as a fallback only in version 3,
     * and snaps the width to an advertised size in version 2. Asserted as
     * literal strings, because the URL is the whole contract with the server
     * and a table is the only place all four can be read against each other.
     */
    const LADDER: ImageServiceFacts = {
        width: 4000,
        height: 3000,
        version: 3,
        level0: true,
        sizes: [
            { width: 500, height: 375 },
            { width: 1000, height: 750 },
            { width: 4000, height: 3000 },
        ],
    };

    // 1201 wide over factors [1,2,4,8]: the two coarsest levels fit in one
    // tile and are whole-image requests, and the base level's own width is 151
    // where the generator wrote 150 — which is what `wholeImageWidths` snaps
    // version 2 to, and what the canonical two-dimensional size sidesteps in
    // version 3.
    const TREE: ImageServiceFacts = {
        width: 1201,
        height: 901,
        version: 3,
        level0: true,
        tileSize: 512,
        scaleFactors: [1, 2, 4, 8],
        sizes: [
            { width: 150, height: 113 },
            { width: 301, height: 226 },
        ],
    };

    const cases: Array<{
        name: string;
        facts: ImageServiceFacts;
        urls: string[];
        fallbacks: Array<string | null>;
    }> = [
        {
            name: 'a size ladder, version 3',
            facts: LADDER,
            urls: [
                'https://ex.org/img/full/500,/0/default.jpg',
                'https://ex.org/img/full/1000,/0/default.jpg',
                'https://ex.org/img/full/max/0/default.jpg',
            ],
            fallbacks: [null, null, null],
        },
        {
            name: 'a size ladder, version 2',
            facts: { ...LADDER, version: 2 },
            urls: [
                'https://ex.org/img/full/500,/0/default.jpg',
                'https://ex.org/img/full/1000,/0/default.jpg',
                'https://ex.org/img/full/full/0/default.jpg',
            ],
            fallbacks: [
                'https://ex.org/img/full/500,/0/native.jpg',
                'https://ex.org/img/full/1000,/0/native.jpg',
                'https://ex.org/img/full/full/0/native.jpg',
            ],
        },
        {
            name: 'a tile tree, version 3',
            facts: TREE,
            urls: [
                'https://ex.org/img/full/151,113/0/default.jpg',
                'https://ex.org/img/full/301,226/0/default.jpg',
                'https://ex.org/img/0,0,1024,901/512,451/0/default.jpg',
                'https://ex.org/img/0,0,512,512/512,512/0/default.jpg',
            ],
            fallbacks: [
                'https://ex.org/img/0,0,1201,901/151,113/0/default.jpg',
                'https://ex.org/img/0,0,1201,901/301,226/0/default.jpg',
                null,
                null,
            ],
        },
        {
            name: 'a tile tree, version 2',
            facts: { ...TREE, version: 2 },
            urls: [
                'https://ex.org/img/full/150,/0/default.jpg',
                'https://ex.org/img/full/301,/0/default.jpg',
                'https://ex.org/img/0,0,1024,901/512,/0/default.jpg',
                'https://ex.org/img/0,0,512,512/512,/0/default.jpg',
            ],
            fallbacks: [null, null, null, null],
        },
    ];

    for (const { name, facts, urls, fallbacks } of cases) {
        it(`is spelled one way for ${name}`, () => {
            const source = (
                facts.tileSize
                    ? buildPyramid('https://ex.org/img', facts)
                    : buildSizeLadder('https://ex.org/img', facts)
            )!;

            expect(
                source.levels.map((level) => tileUrl(source, level, 0, 0)),
            ).toEqual(urls);
            expect(
                source.levels.map(
                    (level) =>
                        tileRequest(source, level, 0, 0).fallback?.url ?? null,
                ),
            ).toEqual(fallbacks);
        });
    }
});
