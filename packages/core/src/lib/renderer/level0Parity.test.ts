/**
 * URL parity for level0 sources: the first-party source model against the
 * OpenSeadragon path it replaces.
 *
 * "Which URL is requested at which zoom, for a given level0 service, must match
 * the current implementation" is ticket 06's acceptance bar, and the only way
 * to hold it honestly is to ask the current implementation rather than to
 * transcribe what it is believed to do. So this drives the REAL
 * `openseadragon` module through `components/osdTileSources`, exactly as the
 * live OpenSeadragon renderer does, and compares.
 *
 * **Delete this file with the OpenSeadragon path (ticket 18).** It is the only
 * thing under `renderer/` that imports either, and it has no meaning once there
 * is nothing to be at parity with.
 *
 * ## The three places parity is deliberately not met
 *
 * Each is asserted below rather than merely noted, so none can regress silently.
 *
 * 1. **`quality`.** A version 2 service is asked for `default`, not `native`.
 *    2.1 deprecated `native`, a 2.0 document is indistinguishable from a 2.1
 *    one, and `tilePyramid.tileUrl` already committed the renderer to `default`
 *    for tiles — one service must not be spelled two ways.
 * 2. **A `sizes[]` that omits the full size.** OpenSeadragon adopts the largest
 *    advertised size as the image's dimensions and then asks that rung for
 *    `full/full`, which returns the original the ladder was avoiding.
 * 3. **level0 WITH tiles.** The current path hides every level below the first
 *    genuinely-tiled one and asks for the level 2 `w,h` size form; the pyramid
 *    keeps the base level and uses the width-only form. Reimplementing this
 *    shape rather than porting it is the ticket's instruction.
 */

import { describe, expect, it } from 'vitest';

import { createIiifTileSource } from '../components/osdTileSources';
import { parseImageService } from './imageService';
import { buildSizeLadder, rungUrl } from './sizeLadder';
import { buildPyramid, chooseLevel, tileUrl } from './tilePyramid';

const SERVICE_ID = 'https://ex.org/img';
const INFO_URL = `${SERVICE_ID}/info.json`;

async function openSeadragon(): Promise<any> {
    const module: any = await import('openseadragon');
    return module.default || module;
}

/**
 * Every whole-image URL the OpenSeadragon path would request, coarsest first.
 *
 * The document is cloned first because `IIIFTileSource` deep-extends its
 * options object in place, and for a `sizes[]` that omits the full size it
 * OVERWRITES `width`/`height` with the largest advertised size — quietly
 * rewriting the fixture the first-party model is then measured against.
 */
async function osdLevelUrls(infoJson: unknown): Promise<string[]> {
    const source: any = createIiifTileSource(
        await openSeadragon(),
        JSON.parse(JSON.stringify(infoJson)),
        INFO_URL,
    );

    const urls: string[] = [];
    for (let level = source.minLevel; level <= source.maxLevel; level += 1) {
        urls.push(source.getTileUrl(level, 0, 0));
    }
    return urls;
}

const v3SizesOnly = {
    '@context': 'http://iiif.io/api/image/3/context.json',
    id: SERVICE_ID,
    type: 'ImageService3',
    profile: 'level0',
    width: 4000,
    height: 3000,
    sizes: [
        { width: 500, height: 375 },
        { width: 1000, height: 750 },
        { width: 4000, height: 3000 },
    ],
};

const v2SizesOnly = {
    '@context': 'http://iiif.io/api/image/2/context.json',
    '@id': SERVICE_ID,
    profile: ['http://iiif.io/api/image/2/level0.json'],
    width: 4000,
    height: 3000,
    sizes: [
        { width: 500, height: 375 },
        { width: 1000, height: 750 },
        { width: 4000, height: 3000 },
    ],
};

function ladderUrls(infoJson: unknown): string[] {
    const facts = parseImageService(infoJson)!;
    const ladder = buildSizeLadder(SERVICE_ID, facts)!;
    return ladder.rungs.map((rung) => rungUrl(ladder, rung));
}

describe('size-ladder source parity with the OpenSeadragon path', () => {
    it('requests the same version 3 whole images, in the same order', async () => {
        expect(ladderUrls(v3SizesOnly)).toEqual(
            await osdLevelUrls(v3SizesOnly),
        );
    });

    it('differs from a version 2 service only in the deprecated `native` quality', async () => {
        const osd = await osdLevelUrls(v2SizesOnly);

        expect(osd).toEqual([
            `${SERVICE_ID}/full/500,/0/native.jpg`,
            `${SERVICE_ID}/full/1000,/0/native.jpg`,
            `${SERVICE_ID}/full/full/0/native.jpg`,
        ]);
        expect(ladderUrls(v2SizesOnly)).toEqual(
            osd.map((url) => url.replace('/native.', '/default.')),
        );
    });

    it('does not inherit the `full/full` request for a ladder missing the full size', async () => {
        const infoJson = {
            ...v2SizesOnly,
            sizes: [
                { width: 500, height: 375 },
                { width: 1000, height: 750 },
            ],
        };

        // OpenSeadragon believes the image IS 1000px wide and asks for the
        // original, which is 12 megapixels of surprise.
        expect(await osdLevelUrls(infoJson)).toEqual([
            `${SERVICE_ID}/full/500,/0/native.jpg`,
            `${SERVICE_ID}/full/full/0/native.jpg`,
        ]);
        expect(ladderUrls(infoJson)).toEqual([
            `${SERVICE_ID}/full/500,/0/default.jpg`,
            `${SERVICE_ID}/full/1000,/0/default.jpg`,
        ]);
    });
});

describe('level0-with-tiles parity with the OpenSeadragon path', () => {
    const withTiles = {
        '@context': 'http://iiif.io/api/image/3/context.json',
        id: SERVICE_ID,
        type: 'ImageService3',
        profile: 'level0',
        width: 1200,
        height: 900,
        tiles: [{ width: 256, scaleFactors: [1, 2, 4, 8] }],
        sizes: [
            { width: 150, height: 113 },
            { width: 300, height: 225 },
            { width: 600, height: 450 },
            { width: 1200, height: 900 },
        ],
    };

    const pyramid = () =>
        buildPyramid(SERVICE_ID, parseImageService(withTiles)!)!;

    it('builds one level per advertised scale factor, and no others', () => {
        // The acceptance bar "level selection never requests a non-advertised
        // scale factor" is structural here: there is no level to select that
        // does not correspond to one.
        expect(pyramid().levels.map((level) => level.scaleFactor)).toEqual([
            8, 4, 2, 1,
        ]);
    });

    it('keeps the base level the current path hides, and spells tiles the level0 way', async () => {
        const built = pyramid();
        const base = built.levels[0];

        // One tile covering the whole image, at an advertised size — the
        // request a level0 derivative tree actually holds.
        expect(base.columns).toBe(1);
        expect(base.rows).toBe(1);
        expect(tileUrl(built, base, 0, 0)).toBe(
            `${SERVICE_ID}/full/150,/0/default.jpg`,
        );

        // The OpenSeadragon path forces `minLevel` past this level entirely and
        // uses the level 2 `w,h` size form for the levels it does keep.
        const osd = await osdLevelUrls(withTiles);
        expect(osd).toEqual([
            `${SERVICE_ID}/0,0,1024,900/256,225/0/default.jpg`,
            `${SERVICE_ID}/0,0,512,512/256,256/0/default.jpg`,
            `${SERVICE_ID}/0,0,256,256/256,256/0/default.jpg`,
        ]);
        expect(tileUrl(built, built.levels[1], 0, 0)).toBe(
            `${SERVICE_ID}/0,0,1024,900/256,/0/default.jpg`,
        );
    });

    it('promotes through the advertised factors as the projection grows', () => {
        const built = pyramid();
        const at = (deviceWidth: number) =>
            chooseLevel(built, deviceWidth / built.width, 0.5).scaleFactor;

        // The base level is the floor: below it there is nothing coarser, so
        // the viewer is never blank.
        expect(at(60)).toBe(8);
        expect(at(75)).toBe(8);
        expect(at(150)).toBe(4);
        expect(at(300)).toBe(2);
        expect(at(600)).toBe(1);
    });
});
