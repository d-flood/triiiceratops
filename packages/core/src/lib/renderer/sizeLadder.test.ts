import { describe, expect, it } from 'vitest';

import {
    buildSizeLadder,
    chooseRung,
    isLevel0Profile,
    ladderFromPyramid,
    rungUrl,
} from './sizeLadder';
import { buildPyramid } from './tilePyramid';
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

    it('does not mistake a higher compliance level for level0', () => {
        expect(isLevel0Profile('level2')).toBe(false);
        expect(isLevel0Profile('http://iiif.io/api/image/2/level1.json')).toBe(
            false,
        );
        expect(isLevel0Profile(undefined)).toBe(false);
        expect(isLevel0Profile(null)).toBe(false);
    });
});

describe('buildSizeLadder', () => {
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

        expect(ladder.rungs).toEqual([
            { index: 0, width: 500, height: 375, scaleFactor: 8 },
            { index: 1, width: 1000, height: 750, scaleFactor: 4 },
            { index: 2, width: 4000, height: 3000, scaleFactor: 1 },
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

        expect(ladder.rungs.map((rung) => rung.width)).toEqual([500, 4000]);
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

        expect(ladder.rungs).toEqual([
            { index: 0, width: 800, height: 1000, scaleFactor: 1 },
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

describe('rungUrl', () => {
    it('asks for a whole image at the advertised width, never a region', () => {
        const ladder = buildSizeLadder('https://ex.org/img', SIZES_ONLY)!;

        expect(rungUrl(ladder, ladder.rungs[0])).toBe(
            'https://ex.org/img/full/500,/0/default.jpg',
        );
        expect(rungUrl(ladder, ladder.rungs[1])).toBe(
            'https://ex.org/img/full/1000,/0/default.jpg',
        );
    });

    it('spells the full-resolution rung `max` in version 3 and `full` in version 2', () => {
        const v3 = buildSizeLadder('https://ex.org/img', SIZES_ONLY)!;
        const v2 = buildSizeLadder('https://ex.org/img', {
            ...SIZES_ONLY,
            version: 2,
        })!;

        expect(rungUrl(v3, v3.rungs[2])).toBe(
            'https://ex.org/img/full/max/0/default.jpg',
        );
        expect(rungUrl(v2, v2.rungs[2])).toBe(
            'https://ex.org/img/full/full/0/default.jpg',
        );
    });

    it('uses the service`s preferred format', () => {
        const ladder = buildSizeLadder('https://ex.org/img', {
            ...SIZES_ONLY,
            format: 'png',
        })!;

        expect(rungUrl(ladder, ladder.rungs[0])).toBe(
            'https://ex.org/img/full/500,/0/default.png',
        );
    });

    it('does not call the largest advertised size `max` when it is not the full image', () => {
        // The OpenSeadragon path adopts the largest advertised size AS the
        // image dimensions, so it asks this service for `full/full` and gets
        // back the 4000px original it cannot decode. The advertised width is
        // the only honest request.
        const ladder = buildSizeLadder('https://ex.org/img', {
            ...SIZES_ONLY,
            sizes: [
                { width: 500, height: 375 },
                { width: 1000, height: 750 },
            ],
        })!;

        expect(rungUrl(ladder, ladder.rungs[1])).toBe(
            'https://ex.org/img/full/1000,/0/default.jpg',
        );
    });
});

describe('chooseRung', () => {
    const ladder = buildSizeLadder('https://ex.org/img', SIZES_ONLY)!;

    /** `imageScale` for a rung drawn 1:1 at `deviceWidth` device pixels. */
    const scaleFor = (deviceWidth: number) => deviceWidth / ladder.width;

    it('promotes as the projection grows, and only to advertised sizes', () => {
        // The `minPixelRatio` walk (see `tilePyramid.chooseLevel`): the finest
        // rung whose device-pixels-per-rung-pixel is at or above the ratio. At
        // 0.5 that is the largest rung no wider than twice what is needed.
        expect(chooseRung(ladder, scaleFor(200), 0.5, NO_CAP).width).toBe(500);
        expect(chooseRung(ladder, scaleFor(600), 0.5, NO_CAP).width).toBe(1000);
        expect(chooseRung(ladder, scaleFor(3000), 0.5, NO_CAP).width).toBe(
            4000,
        );

        for (const deviceWidth of [1, 10, 137, 800, 2500, 9000]) {
            expect(ladder.rungs.map((rung) => rung.width)).toContain(
                chooseRung(ladder, scaleFor(deviceWidth), 0.5, NO_CAP).width,
            );
        }
    });

    it('falls back to the coarsest rung rather than to nothing', () => {
        expect(chooseRung(ladder, scaleFor(1), 0.5, NO_CAP).width).toBe(500);
    });

    it('refuses to promote past the decoded-pixel cap', () => {
        // 4000x3000 is 12 megapixels — 48 MB decoded. Capped at 1 megapixel,
        // deep zoom settles for the 1000px rung and accepts the blur.
        expect(chooseRung(ladder, scaleFor(4000), 0.5, 1_000_000).width).toBe(
            1000,
        );
        // Uncapped, the same view takes the largest rung.
        expect(chooseRung(ladder, scaleFor(4000), 0.5, NO_CAP).width).toBe(
            4000,
        );
    });

    it('still returns the cheapest rung when every rung is over the cap', () => {
        expect(chooseRung(ladder, scaleFor(4000), 0.5, 1).width).toBe(500);
    });

    it('takes a blurrier rung as `minPixelRatio` rises', () => {
        expect(chooseRung(ladder, scaleFor(900), 0.5, NO_CAP).width).toBe(1000);
        expect(chooseRung(ladder, scaleFor(900), 2, NO_CAP).width).toBe(500);
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

        expect(ladder.rungs).toEqual([
            { index: 0, width: 150, height: 113, scaleFactor: 8 },
            { index: 1, width: 300, height: 225, scaleFactor: 4 },
            { index: 2, width: 600, height: 450, scaleFactor: 2 },
            { index: 3, width: 1200, height: 900, scaleFactor: 1 },
        ]);
        expect(rungUrl(ladder, ladder.rungs[0])).toBe(
            'https://ex.org/img/full/150,/0/default.png',
        );
        expect(rungUrl(ladder, ladder.rungs[3])).toBe(
            'https://ex.org/img/full/max/0/default.png',
        );
    });
});
