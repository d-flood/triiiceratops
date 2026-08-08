/**
 * Seam 2 — continuous mode on an 800-canvas manifest, in a real browser (spec
 * §Testing Decisions, "Residency and memory counters").
 *
 * This is the ticket the epic exists for, and it is the one claim the planner's
 * unit tests cannot finish making. `planScene.test.ts` proves what the planner
 * DECIDES on an 800-canvas world; only a browser can show what the host and the
 * tile scheduler then DO with it — how many requests actually leave, how many
 * decoded bytes are actually held, and whether the resident set really is a
 * function of where the viewport is rather than of how it got there.
 *
 * Counters, never heap metrics. Decoded images live outside the JS heap, so a
 * heap ceiling reads near-flat while tiles leak; the renderer exposes resident
 * tile count and decoded bytes as a first-class feature for exactly this.
 *
 * Every position asserted here is arithmetic this file states. The fixture's
 * canvases are all 1200x900, so median-height normalization is the identity and
 * the gap is `MULTI_CANVAS_GAP_FRACTION` of 1200 — canvas *i* begins at
 * `i * PITCH`.
 */

import { expect, test, type Page } from '@playwright/test';

import {
    CONTINUOUS_CANVAS_COUNT,
    CONTINUOUS_MANIFEST,
    CONTINUOUS_PAGE,
    continuousCanvasId,
    findFeature,
    getResidency,
    getStats,
    getView,
    GRID_FEATURES,
    nextPaint,
    openRendererManifest,
    predictScreenPoint,
    setByteBudget,
    setView,
    zoomAt,
} from './helpers/numberedGrid';
import {
    DEFAULT_BUDGETS,
    METADATA_IN_FLIGHT_LIMIT,
    MULTI_CANVAS_GAP_FRACTION,
} from '../src/lib/renderer/rendererDefaults';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

/** Canvas width plus the resolved gap: where the next folio begins. */
const PITCH =
    CONTINUOUS_PAGE.width + MULTI_CANVAS_GAP_FRACTION * CONTINUOUS_PAGE.width;

/** The canvas-space centre of folio `index`. */
function folioCentre(index: number) {
    return {
        x: index * PITCH + CONTINUOUS_PAGE.width / 2,
        y: CONTINUOUS_PAGE.height / 2,
    };
}

/**
 * Frame folio `index` so the viewport is exactly one page wide.
 *
 * At that scale which canvases are on screen is not a matter of taste: the
 * viewport box is folio `index`'s own span, its neighbours are the ±1 canvases,
 * and folios two away are outside the residency margin. Every residency
 * expectation below follows from this one choice.
 */
async function frameFolio(page: Page, index: number) {
    const view = await getView(page);
    await setView(page, {
        centre: folioCentre(index),
        scale: view.width / CONTINUOUS_PAGE.width,
    });
    // The frame that paints the new view has landed; the one that reconciles
    // what it decided against the network has not necessarily finished.
    await nextPaint(page);
}

/**
 * The resident tile count once the scheduler has stopped moving.
 *
 * A view has settled long before its tiles have: the frame that paints a new
 * viewport is the frame that asks for the tiles, and the count only reaches its
 * final value once every one of them has been fetched and decoded. Polling for
 * a value that has stopped changing is what makes "the same resident set" a
 * comparison between two finished states rather than between two moments.
 */
async function settledResidentTileCount(page: Page): Promise<number> {
    let previous = -1;
    for (let attempt = 0; attempt < 60; attempt += 1) {
        await page.waitForTimeout(100);
        const { residentTileCount } = await getStats(page);
        if (residentTileCount > 0 && residentTileCount === previous) {
            return residentTileCount;
        }
        previous = residentTileCount;
    }
    throw new Error(`resident tile count never settled (last ${previous})`);
}

/**
 * Opening the fixture is deliberately allowed longer than the other renderer
 * specs, and not for a renderer reason: the viewer chrome walks every canvas in
 * a manifest to build its canvas list, labels, and thumbnail gallery, and 800
 * of them through the dev server's deep reactive proxies is seconds of work
 * that has nothing to do with tiles. The renderer's own claims — O(1) requests,
 * bounded bytes, the resident set by name — are asserted from counters below,
 * where this wait cannot flatter them.
 */
const OPEN_TIMEOUT = 60_000;

async function open(page: Page) {
    await openRendererManifest(
        page,
        CONTINUOUS_MANIFEST,
        { viewingMode: 'continuous' },
        OPEN_TIMEOUT,
    );
}

/** Canvas ids as the fixture spells them on this page's origin. */
function folio(page: Page, index: number) {
    return continuousCanvasId(index, new URL(page.url()).origin);
}

test.describe('Canvas2D renderer — continuous mode, virtualized', () => {
    test('opens an 800-canvas manifest with O(1) network requests', async ({
        page,
    }) => {
        // The behaviour this epic exists to remove: the OpenSeadragon path
        // fetched every canvas's `info.json` in one parallel burst before
        // anything rendered, because layout was computed from resolved tile
        // sources rather than from the manifest. 800 folios, 800 requests.
        const infoRequests: string[] = [];
        page.on('request', (request) => {
            if (request.url().includes('/info.json')) {
                infoRequests.push(request.url());
            }
        });

        await open(page);
        await nextPaint(page);

        expect(
            infoRequests.length,
            `opened with ${infoRequests.length} info.json requests for ${CONTINUOUS_CANVAS_COUNT} canvases`,
        ).toBeLessThanOrEqual(4);
        // …and the manifest really is 800 canvases long, so the number above is
        // a bound rather than a coincidence about a short fixture.
        const residency = await getResidency(page);
        expect(
            residency.pyramid.length +
                residency.thumbnail.length +
                residency.boxCount,
        ).toBe(CONTINUOUS_CANVAS_COUNT);
    });

    test('lays folio 400 out where the coordinate model says, and paints it there', async ({
        page,
    }) => {
        // The geometric gate, on a canvas 400 cumulative offsets into the
        // world. Only folio 400 is in the viewport at this framing, so the
        // feature found by colour can only have come from it.
        await open(page);
        await frameFolio(page, 400);

        // Polled rather than asserted once: the first frame at a new view is
        // deliberately the base level magnified (blur-up), and a heavily
        // downscaled marker can fall outside the colour tolerance until the
        // current level lands. The assertion is that the current level arrives
        // and puts the feature within a pixel of its predicted place.
        await expect
            .poll(
                async () => {
                    const view = await getView(page);
                    const expected = predictScreenPoint(
                        {
                            x: 400 * PITCH + GRID_FEATURES.bravo.x,
                            y: GRID_FEATURES.bravo.y,
                        },
                        view,
                    );
                    const actual = await findFeature(page, 'bravo');
                    if (!actual) {
                        await nextPaint(page);
                        return null;
                    }
                    return {
                        x: Math.abs(actual.x - expected.x) <= 1,
                        y: Math.abs(actual.y - expected.y) <= 1,
                    };
                },
                { timeout: OPEN_TIMEOUT },
            )
            .toEqual({ x: true, y: true });
    });

    test('leaves exactly the expected folios holding pyramids at folio 400', async ({
        page,
    }) => {
        await open(page);
        await frameFolio(page, 400);

        const residency = await getResidency(page);

        // By NAME: the folio on screen and its two neighbours — the ±1 canvas
        // rule, which is what makes turning the page instant. A count would
        // pass just as happily with the wrong three.
        expect(residency.pyramid.sort()).toEqual(
            [folio(page, 399), folio(page, 400), folio(page, 401)].sort(),
        );
        expect(residency.boxCount).toBe(CONTINUOUS_CANVAS_COUNT - 3);
    });

    test('gives the same resident set at folio 400 whether it was reached directly or by way of 700', async ({
        page,
    }) => {
        // Residency is a pure function of viewport position, which is the whole
        // reason eviction is distance-based rather than LRU. An LRU makes the
        // resident set a function of scroll history: non-reproducible, and this
        // assertion could not exist.
        await open(page);

        await frameFolio(page, 400);
        const directTiles = await settledResidentTileCount(page);
        const direct = await getResidency(page);

        await frameFolio(page, 700);
        await settledResidentTileCount(page);
        await frameFolio(page, 120);
        await settledResidentTileCount(page);
        await frameFolio(page, 400);
        const viaElsewhereTiles = await settledResidentTileCount(page);

        const viaElsewhere = await getResidency(page);
        expect(viaElsewhere.pyramid.sort()).toEqual(direct.pyramid.sort());
        expect(viaElsewhere.thumbnail.sort()).toEqual(direct.thumbnail.sort());
        expect(viaElsewhere.boxCount).toBe(direct.boxCount);

        // Not merely bounded — identical. Two visits to the same viewport hold
        // the same tiles, which is what "distance-based, not LRU" means.
        expect(viaElsewhereTiles).toBe(directTiles);
    });

    test('releases a folio’s base level when it leaves the pyramid tier', async ({
        page,
    }) => {
        // "The base level is never evicted" is scoped to the pyramid tier
        // (spec §Further Notes). Applied across 800 canvases it would mean 800
        // resident base tiles — two locally sensible rules contradicting each
        // other, and this is the one that has to give.
        await open(page);
        await frameFolio(page, 400);
        const near = await settledResidentTileCount(page);

        // Four folios on: 400 is no longer even in the residency window. With
        // no opportunistic cache to hold what it dropped, everything it held
        // goes — base level included.
        await setByteBudget(page, 0);
        await frameFolio(page, 404);

        const residency = await getResidency(page);
        expect(residency.pyramid).not.toContain(folio(page, 400));

        // Settled, not sampled: a view arrives a frame before its tiles do, and
        // a count read mid-flight would be comparing two different moments.
        const afterTiles = await settledResidentTileCount(page);
        expect((await getStats(page)).cachedTileCount).toBe(0);
        // The resident set did not accumulate the second window on top of the
        // first: four folios along it is exactly the same size, which it can
        // only be if folio 400 gave up everything — base level included.
        expect(afterTiles).toBe(near);
    });

    test('holds decoded bytes under the stated budget through sustained scrolling', async ({
        page,
    }) => {
        // A budget this spec states rather than the shipped 128 MB, which no
        // fixture manifest could approach — an assertion against the default
        // would pass with the cache unbounded.
        //
        // And CALIBRATED against this browser's own required set rather than
        // written out as a number. The budget governs the opportunistic cache
        // and has no lever over the required set by construction, so a figure
        // below what three folios of pyramid cost would be asserting that the
        // cache can do something it cannot — and how much three folios cost
        // depends on the surface size, which is the harness's business and not
        // this spec's. Measured with the cache turned off, which is exactly the
        // required set, and then tripled: room for about two folios of cache,
        // against the hundred-odd megabytes thirty folios would reach unbounded.
        await open(page);
        await frameFolio(page, 100);
        await setByteBudget(page, 0);
        await settledResidentTileCount(page);
        const requiredBytes = (await getStats(page)).decodedBytes;
        expect(requiredBytes).toBeGreaterThan(0);

        const BUDGET = requiredBytes * 3;
        await setByteBudget(page, BUDGET);
        expect((await getStats(page)).byteBudget).toBe(BUDGET);

        let everCached = 0;
        for (let folioIndex = 101; folioIndex <= 130; folioIndex += 1) {
            await frameFolio(page, folioIndex);
            const stats = await getStats(page);
            everCached = Math.max(everCached, stats.cachedTileCount);
            expect(
                stats.decodedBytes,
                `folio ${folioIndex} held ${stats.decodedBytes} bytes against a ${BUDGET} budget`,
            ).toBeLessThanOrEqual(BUDGET);
        }

        // The budget was honoured by TRIMMING a cache that filled, not by a
        // cache that never held anything — which would make the assertion above
        // vacuous.
        expect(everCached).toBeGreaterThan(0);

        // …and it is still painting, so the budget was honoured by evicting
        // rather than by never loading anything.
        await expect
            .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
            .not.toBeNull();
    });

    test('clamps zooming out at the derived floor, and issues no request storm', async ({
        page,
    }) => {
        // Peak CONCURRENT `info.json`, not the total. The tier and the
        // view-stable gate decide which canvases may ask and when; without a
        // concurrency cap on top of them the first frame after a flick settles
        // starts one request per thumbnail-tier canvas in the residency window
        // — roughly fifty here — which is the fetch storm this epic exists to
        // remove, arriving one frame later rather than not at all. Counted from
        // request events rather than through `page.route`, which would add
        // latency of its own and change the thing being measured.
        let concurrentInfo = 0;
        let peakConcurrentInfo = 0;
        const isInfo = (url: string) => url.includes('/info.json');
        page.on('request', (request) => {
            if (!isInfo(request.url())) return;
            concurrentInfo += 1;
            peakConcurrentInfo = Math.max(peakConcurrentInfo, concurrentInfo);
        });
        const settle = (request: { url(): string }) => {
            if (isInfo(request.url())) concurrentInfo -= 1;
        };
        page.on('requestfinished', settle);
        page.on('requestfailed', settle);

        // The floor is DERIVED — the zoom at which the median canvas reaches
        // the box threshold — not a percentage of home zoom. Below it every
        // canvas is confetti and there is nothing to lose; the old path's floor
        // was `homeZoom * 0.8` over the whole world, so a reader could zoom out
        // past "all 800 pages fit" and the viewer would try to render it.
        await open(page);
        await frameFolio(page, 400);
        await settledResidentTileCount(page);

        const before = await getStats(page);

        // Far past any legal scale, several times over, so the clamp is what
        // stops it rather than the animation running out of road.
        for (let step = 0; step < 4; step += 1) {
            const view = await getView(page);
            await zoomAt(page, { x: view.width / 2, y: view.height / 2 }, 0.02);
        }

        const view = await getView(page);
        const medianCanvasExtent = Math.sqrt(
            CONTINUOUS_PAGE.width * CONTINUOUS_PAGE.height,
        );

        // The floor, written out from the fixture's own dimensions and the
        // renderer's box threshold rather than read back from the renderer.
        expect(view.scale * medianCanvasExtent).toBeCloseTo(
            DEFAULT_BUDGETS.boxThreshold,
            5,
        );

        // Nothing is above the pyramid threshold down here, so nothing is being
        // asked for.
        const residency = await getResidency(page);
        expect(residency.pyramid).toEqual([]);

        // Two things make "no request storm" true, and they are different
        // claims. The TRANSIT never widens into one: zooming out grows the
        // residency window, but it shrinks the projected size just as fast, so
        // only ever a handful of canvases are above the pyramid threshold at
        // once — nothing like the one-request-per-canvas the old path issued.
        const atFloor = await getStats(page);
        expect(
            atFloor.tileRequestCount - before.tileRequestCount,
            `zooming out cost ${atFloor.tileRequestCount - before.tileRequestCount} requests on an ${CONTINUOUS_CANVAS_COUNT}-canvas manifest`,
        ).toBeLessThan(CONTINUOUS_CANVAS_COUNT / 8);

        // And the FLOOR itself is quiet: sitting there asks for nothing at all.
        await nextPaint(page);
        await nextPaint(page);
        expect((await getStats(page)).tileRequestCount).toBe(
            atFloor.tileRequestCount,
        );

        // Metadata is capped as well as gated. This fixture's services are
        // level 2, so its thumbnail-tier canvases construct their URLs from the
        // manifest and never ask at all — which is the bound holding one level
        // up, and would break loudly here if the ladder ever started asking per
        // canvas. The cap itself is unit-tested in `imageService.test.ts`,
        // where a level0 service can be described without an 800-canvas
        // level0 fixture.
        expect(
            peakConcurrentInfo,
            `peak ${peakConcurrentInfo} concurrent info.json requests over the zoom-out to the floor`,
        ).toBeLessThanOrEqual(METADATA_IN_FLIGHT_LIMIT);
    });
});
