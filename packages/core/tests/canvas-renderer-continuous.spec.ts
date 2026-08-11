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
    countOpaqueSurfacePixels,
    findFeature,
    getResidency,
    getStats,
    getView,
    type RendererStats,
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
    MIN_ZOOM_FRACTION,
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
/**
 * The renderer's counters once the request queue has stopped moving.
 *
 * Distinct from {@link settledResidentTileCount}, which waits on what is HELD: a
 * request that 404s or is aborted changes `tileRequestCount` without ever
 * becoming a resident tile, so a spec counting requests has to watch the count it
 * is actually asserting on.
 *
 * Three consecutive unchanged samples rather than one, because a single
 * unchanged sample is routinely a gap between two requests draining out of the
 * bounded in-flight window — especially with other workers competing for the
 * machine.
 */
async function settledStats(page: Page): Promise<RendererStats> {
    let previous = -1;
    let unchanged = 0;

    for (let attempt = 0; attempt < 80; attempt += 1) {
        await page.waitForTimeout(100);
        const stats = await getStats(page);
        if (stats.tileRequestCount === previous) {
            unchanged += 1;
            if (unchanged >= 3) return stats;
        } else {
            unchanged = 0;
            previous = stats.tileRequestCount;
        }
    }

    throw new Error(`tile request count never settled (last ${previous})`);
}

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

const SURFACE = '[data-testid="canvas-renderer-surface"]';

/**
 * Sample the viewport centre's x once per animation frame, from INSIDE the page.
 *
 * A round trip per sample takes long enough for the animation to finish in
 * between, so a polled test sees the destination and nothing else — the same
 * reason the wheel-easing assertion in `canvas-renderer.spec.ts` records this
 * way.
 */
async function recordCentreX(page: Page): Promise<void> {
    await page.locator(SURFACE).evaluate((element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: {
                    getView(): { centre: { x: number } };
                };
            }
        ).__triiiceratopsRenderer!;
        const recorder = window as unknown as { __centreSamples: number[] };
        recorder.__centreSamples = [];

        const tick = () => {
            recorder.__centreSamples.push(handle.getView().centre.x);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

async function centreSamples(page: Page): Promise<number[]> {
    return page.evaluate(
        () =>
            (window as unknown as { __centreSamples: number[] })
                .__centreSamples,
    );
}

/** Whether the renderer reports itself in motion right now. */
function moving(page: Page): Promise<boolean> {
    return page.locator(SURFACE).evaluate((element) =>
        (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer: { isMoving(): boolean };
            }
        ).__triiiceratopsRenderer.isMoving(),
    );
}

test.describe('Canvas2D renderer — continuous mode, virtualized', () => {
    test('opens an 800-canvas manifest with O(1) network requests', async ({
        page,
    }) => {
        // The behaviour this epic exists to remove: the previous renderer
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

    test('travels to the next folio when the canvas navigator is used, rather than snapping', async ({
        page,
    }) => {
        // Canvas navigation is one of the animated cases (ADR 0015), and in
        // continuous mode it is the case that shows: the folio being navigated
        // to is already laid out beside the one on screen, so the trip has a
        // path to travel along and cutting it reads as the world teleporting.
        //
        // Asserted on the real chrome control rather than on the port, because
        // the animation is not the navigator's decision to make: it presses the
        // same `nextCanvas()` a host would, and the renderer's scene effect is
        // what has to know that a new current canvas inside one laid-out world
        // is travel.
        await open(page);
        await nextPaint(page);
        expect((await getView(page)).centre.x).toBeCloseTo(folioCentre(0).x, 0);

        await recordCentreX(page);
        await page.getByLabel('Next Canvas').first().click();

        await expect.poll(() => moving(page), { timeout: 10_000 }).toBe(false);
        const samples = await centreSamples(page);

        // It arrived…
        expect(samples[samples.length - 1]).toBeCloseTo(folioCentre(1).x, 0);
        // …and it did NOT arrive in one frame. A snap puts the destination in
        // the first post-click sample and every sample after it, so the whole
        // run holds exactly two distinct values; travel produces a run of them.
        expect(
            new Set(samples).size,
            `canvas navigation reached folio 1 in one frame: ${samples.slice(0, 6).join(', ')}`,
        ).toBeGreaterThan(2);
        // Towards the target throughout, with no overshoot — the exponential
        // approach every other animated case takes.
        for (let i = 1; i < samples.length; i += 1) {
            expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
            expect(samples[i]).toBeLessThanOrEqual(folioCentre(1).x + 1);
        }
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

    test('clamps zooming out at a fraction of home zoom, and issues no request storm', async ({
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

        // The floor a reader meets is a fraction of HOME ZOOM — the fit of the
        // folio on screen — and the renderer's derived floor (the zoom at which
        // the median canvas reaches the box threshold) is only a backstop
        // beneath it. Home zoom is one folio here, not the whole world: the old
        // path's `homeZoom * 0.8` was measured over the world, so on an
        // 800-folio manifest a reader could zoom out past "all 800 pages fit"
        // and the viewer would try to render it.
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
        // Home zoom for one folio, and the floor, both written out from the
        // fixture's own dimensions rather than read back from the renderer.
        const homeScale = Math.min(
            view.width / CONTINUOUS_PAGE.width,
            view.height / CONTINUOUS_PAGE.height,
        );
        expect(view.scale).toBeCloseTo(homeScale * MIN_ZOOM_FRACTION, 6);

        // …and the point of stopping there: a folio at the floor is still a page
        // on screen, comfortably clear of the box threshold at which the renderer
        // would have nothing left to draw. The derived floor stops at that
        // threshold exactly, which is a two-dozen-pixel speck.
        const medianCanvasExtent = Math.sqrt(
            CONTINUOUS_PAGE.width * CONTINUOUS_PAGE.height,
        );
        expect(view.scale * medianCanvasExtent).toBeGreaterThan(
            DEFAULT_BUDGETS.boxThreshold * 2,
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
        // Settled first, not sampled two frames after arriving. The floor holds
        // about ten thumbnail-tier folios, each worth up to two rungs, and they
        // drain through a six-wide window — so a count read two frames in is a
        // queue still emptying, not a total. Reading it before it stops moving
        // makes both assertions below about scheduling latency instead of about
        // how much was asked for.
        const atFloor = await settledStats(page);
        expect(
            atFloor.tileRequestCount - before.tileRequestCount,
            `zooming out cost ${atFloor.tileRequestCount - before.tileRequestCount} requests on an ${CONTINUOUS_CANVAS_COUNT}-canvas manifest`,
        ).toBeLessThan(CONTINUOUS_CANVAS_COUNT / 8);

        // And the FLOOR itself is quiet: sitting there asks for nothing more.
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

    test('leaves a page-sized picture on screen at the floor a gesture can reach', async ({
        page,
    }) => {
        // The reader-facing half of the claim, and the one the pixel counts make
        // rather than the tier map. Zooming all the way out through the real
        // clamp has to leave something a reader would call a picture — the
        // renderer's derived floor left a folio 24 CSS pixels across, which is
        // painted, correct, and indistinguishable from an empty viewer.
        await open(page);
        await frameFolio(page, 400);
        await settledResidentTileCount(page);

        const framed = await countOpaqueSurfacePixels(page);
        expect(framed).toBeGreaterThan(0);

        for (let step = 0; step < 4; step += 1) {
            const view = await getView(page);
            await zoomAt(page, { x: view.width / 2, y: view.height / 2 }, 0.02);
        }

        // A thirtieth of the framed folio's pixels is the floor this asserts
        // against: the fixture paints ten-odd folios down here at an eighth of
        // fitted linear size, so the real figure is nearer a tenth. What it rules
        // out is the two-dozen-pixel speck, which was a five-hundredth.
        await expect
            .poll(() => countOpaqueSurfacePixels(page), { timeout: 20_000 })
            .toBeGreaterThan(framed / 30);
    });

    test('keeps painting real pixels far BELOW the derived floor', async ({
        page,
    }) => {
        // The floor is where the CLAMP stops a gesture; it is not where the
        // renderer stops working. Zooming out past it must soften the picture,
        // never extinguish it — zoom bounds are a setting still to come, and
        // until they exist nothing about a scale is a reason to render nothing.
        //
        // Reached with `setView` deliberately, which is the programmatic path
        // and does not go through the clamp: this is a claim about the PLANNER's
        // floor, and it has to hold at a scale a gesture cannot even reach.
        await open(page);
        await frameFolio(page, 400);
        await settledResidentTileCount(page);

        // An eighth of the derived floor: every one of the 800 folios is on
        // screen and every one is well below the box threshold, so the size test
        // alone leaves nothing at any tier at all. An eighth rather than a
        // thousandth because the PAINTER has a floor of its own that is not a
        // policy — it snaps to whole device pixels, so content a hundredth of a
        // pixel across has nowhere to land. Three pixels a folio is the smallest
        // thing there is any point asserting is on screen.
        const floor =
            DEFAULT_BUDGETS.boxThreshold /
            Math.sqrt(CONTINUOUS_PAGE.width * CONTINUOUS_PAGE.height);
        await setView(page, {
            centre: folioCentre(400),
            scale: floor / 8,
        });
        await nextPaint(page);

        // The tier floor: the folio the reader is centred on and its two
        // neighbours, and nothing else. Bounded, because at this scale "paint
        // whatever is visible" would be all 800 of them — the fetch storm this
        // epic removed, in a different costume.
        const residency = await getResidency(page);
        expect(residency.pyramid).toEqual([]);
        expect(residency.thumbnail.length).toBeGreaterThan(0);
        expect(residency.thumbnail.length).toBeLessThanOrEqual(3);
        expect(residency.thumbnail).toContain(folio(page, 400));

        // …and it is a DECODED IMAGE on screen, not the placeholder rect. The
        // placeholder ink is translucent, so a fully opaque pixel can only have
        // come from a thumbnail the scheduler fetched, decoded, and painted.
        await expect
            .poll(() => countOpaqueSurfacePixels(page), { timeout: 20_000 })
            .toBeGreaterThan(0);
    });
});
