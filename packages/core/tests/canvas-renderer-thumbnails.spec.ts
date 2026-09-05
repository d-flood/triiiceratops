/**
 * The **thumbnail tier**, in a real browser.
 *
 * The planner's unit tests prove what it DECIDES for a thumbnail-tier canvas:
 * which rung, from which branch of the ladder, and under which gate. What only
 * a browser can show is what then actually leaves the machine — how many
 * distinct URLs a zoom sweep really costs, whether a gesture really is silent,
 * and in what order the requests really arrive.
 *
 * The 800-canvas fixture is the one worth asking. At a zoomed-out framing its
 * residency window holds a dozen thumbnail-tier canvases at once, which is the
 * shape the concurrency cap and the view-stable gate exist for; a short manifest
 * would pass every assertion here with neither.
 *
 * ## Telling a thumbnail apart from a tile
 *
 * Both are `full/{n},/0/default.{ext}` requests against the same fixture
 * service, and the discriminator is `{n}`. The ladder asks for
 * {@link THUMBNAIL_RUNGS} — 32/64/128/256/512 — while the pyramid's whole-image
 * levels over a 1200x900 grid are 1200/600/300/150. Two disjoint sets, so the
 * classification is exact rather than a guess about extensions.
 */

import { expect, test, type Page } from '@playwright/test';

import {
    CONTINUOUS_MANIFEST,
    CONTINUOUS_PAGE,
    continuousCanvasId,
    countOpaqueSurfacePixels,
    getResidency,
    getStats,
    getView,
    nextPaint,
    openRendererManifest,
    setView,
} from './helpers/numberedGrid';
import {
    DEFAULT_BUDGETS,
    DEFAULT_ZOOM_PER_WHEEL_NOTCH,
    MULTI_CANVAS_GAP_FRACTION,
    TILE_IN_FLIGHT_LIMIT,
    WHEEL_NOTCH_PIXELS,
} from '../src/lib/renderer/rendererDefaults';
import { THUMBNAIL_RUNGS } from '../src/lib/renderer/thumbnailLadder';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'The Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const OPEN_TIMEOUT = 60_000;

/** Canvas width plus the resolved gap: where the next folio begins. */
const PITCH =
    CONTINUOUS_PAGE.width + MULTI_CANVAS_GAP_FRACTION * CONTINUOUS_PAGE.width;

/** The orientation-invariant canvas-space size the tier is decided from. */
const PAGE_EXTENT = Math.sqrt(CONTINUOUS_PAGE.width * CONTINUOUS_PAGE.height);

/**
 * One observed whole-image request, classified.
 *
 * `index` is the folio it belongs to, read from the fixture's service id, which
 * is what makes "centre-out" assertable by NAME rather than by count.
 */
interface ImageRequest {
    url: string;
    index: number;
    size: number;
    thumbnail: boolean;
}

const WHOLE_IMAGE =
    /\/iiif-fixture\/c800-(\d+)\/full\/(\d+),\/0\/default\.\w+$/;

function classify(url: string): ImageRequest | null {
    const match = WHOLE_IMAGE.exec(url);
    if (!match) return null;

    const size = Number(match[2]);
    return {
        url,
        index: Number(match[1]),
        size,
        thumbnail: THUMBNAIL_RUNGS.includes(size),
    };
}

interface Traffic {
    thumbnails: ImageRequest[];
    infoJson: string[];
    /** The most requests of any kind that were in flight at one moment. */
    peakInFlight: number;
    reset(): void;
}

/**
 * Watch what the page asks for.
 *
 * In-flight is counted from the request/finish events rather than inferred,
 * because the bounded window is the one claim here whose failure mode is
 * invisible in a total: an uncapped renderer asks for the same URLs, just all
 * at once.
 *
 * What this counts is the window PLUS the browser's cancellation lag, and the
 * difference is not the observer's fault. A request the scheduler aborts is
 * rejected in the page immediately but reported as `requestfailed` tens of
 * milliseconds later — around 80ms median, measured on this fixture — so a
 * viewport change that aborts and replaces tiles reads here as `limit + aborts`
 * for that gap however honest the scheduler is. Nothing in the platform tells a
 * page when a cancelled socket is actually released, so the scheduler bounds
 * what it can: live `fetch` operations, aborting ones included
 * (`tileScheduler.ts`, `outstanding`). A peak over the limit in a spec that
 * does not pan is therefore worth investigating rather than dismissing — it
 * cannot be event ordering, because the scheduler starts a replacement only
 * after the previous attempt's fetch AND decode have settled, which is strictly
 * later than the browser's own `loadingFinished`.
 */
function watchTraffic(page: Page): Traffic {
    const traffic: Traffic = {
        thumbnails: [],
        infoJson: [],
        peakInFlight: 0,
        reset() {
            traffic.thumbnails = [];
            traffic.infoJson = [];
            traffic.peakInFlight = 0;
        },
    };

    let inFlight = 0;

    page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/info.json')) {
            traffic.infoJson.push(url);
            return;
        }

        const image = classify(url);
        if (!image) return;

        inFlight += 1;
        traffic.peakInFlight = Math.max(traffic.peakInFlight, inFlight);
        if (image.thumbnail) traffic.thumbnails.push(image);
    });

    const settle = (request: { url(): string }) => {
        if (classify(request.url())) inFlight = Math.max(0, inFlight - 1);
    };
    page.on('requestfinished', settle);
    page.on('requestfailed', settle);

    return traffic;
}

async function open(page: Page) {
    await openRendererManifest(
        page,
        CONTINUOUS_MANIFEST,
        { viewingMode: 'continuous' },
        OPEN_TIMEOUT,
    );
}

/**
 * Frame folio `index` at a scale that puts it — and its neighbours — squarely in
 * the **thumbnail tier**.
 *
 * `effective` is the projected size the tier is decided from, so this states the
 * tier it is asking for rather than a scale that happens to land there. The
 * shipped band is 24–320; 120 is comfortably inside it and puts about a dozen
 * folios on screen.
 */
async function frameThumbnails(page: Page, index: number, effective = 120) {
    await setView(page, {
        centre: {
            x: index * PITCH + CONTINUOUS_PAGE.width / 2,
            y: CONTINUOUS_PAGE.height / 2,
        },
        scale: effective / PAGE_EXTENT,
    });
    await nextPaint(page);
}

/**
 * Poll until a value has stopped changing, then return it.
 *
 * `stableReads` is the number of consecutive unchanged samples that count as
 * settled, and it matters more here than it looks: a view settles a frame after
 * it is set, while the requests it asked for drain out of the bounded window
 * over the following seconds. One unchanged sample is routinely a gap between
 * two of them, especially with other workers competing for the machine.
 */
async function settled<T>(
    read: () => Promise<T>,
    stableReads = 3,
    attempts = 40,
): Promise<T> {
    let previous = JSON.stringify(await read());
    let unchanged = 0;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const current = await read();
        const serialized = JSON.stringify(current);

        if (serialized === previous) {
            unchanged += 1;
            if (unchanged >= stableReads) return current;
        } else {
            unchanged = 0;
            previous = serialized;
        }
    }

    return read();
}

test.describe('Canvas2D renderer — the thumbnail tier', () => {
    test('fills the grey boxes: every thumbnail-tier folio gets a small image', async ({
        page,
    }) => {
        // Scrolling a long manuscript at anything short of reading zoom must
        // not show a river of empty rectangles: every visible canvas needs
        // pixels, not just the two or three holding pyramids.
        await open(page);
        const traffic = watchTraffic(page);

        await frameThumbnails(page, 400);
        await settled(() => getStats(page).then((s) => s.tileRequestCount));

        const residency = await getResidency(page);
        expect(
            residency.thumbnail.length,
            'the framing must actually put folios in the thumbnail tier',
        ).toBeGreaterThan(4);
        // No pyramids down here: this is the tier under test, not a pyramid
        // with a smaller margin.
        expect(residency.pyramid).toEqual([]);

        const asked = new Set(
            traffic.thumbnails.map((request) =>
                continuousCanvasId(request.index, new URL(page.url()).origin),
            ),
        );
        for (const canvasId of residency.thumbnail) {
            expect(asked, `no thumbnail asked for ${canvasId}`).toContain(
                canvasId,
            );
        }

        // …and they are held, which is what actually paints them.
        expect((await getStats(page)).residentTileCount).toBeGreaterThan(4);
    });

    test('costs a level 2 manifest no info.json to fill its thumbnails', async ({
        page,
    }) => {
        // Rung 2 of the ladder: a service whose manifest-declared profile is
        // level 1 or 2 answers any size, so the URL is constructible without
        // discovery. Filling a dozen grey boxes must not cost a dozen requests
        // before it costs a dozen images.
        await open(page);
        const traffic = watchTraffic(page);

        await frameThumbnails(page, 400);
        await settled(() => getStats(page).then((s) => s.tileRequestCount));

        expect(traffic.thumbnails.length).toBeGreaterThan(4);
        expect(traffic.infoJson).toEqual([]);
    });

    test('a continuous zoom produces a SMALL set of distinct sizes, not one per frame', async ({
        page,
    }) => {
        // The decision the quantized ladder exists for. Computed from the exact
        // projection instead, every step of this sweep would mint a fresh URL
        // for every canvas on screen, every one would miss the HTTP cache, and
        // a real pinch would do it once per frame.
        await open(page);
        const traffic = watchTraffic(page);

        const STEPS = 20;
        for (let step = 0; step <= STEPS; step += 1) {
            // Across the whole thumbnail band, from just above the box
            // threshold to just below the pyramid one.
            await frameThumbnails(page, 400, 30 + (step * 280) / STEPS);
        }
        await settled(() => getStats(page).then((s) => s.tileRequestCount));

        const sizes = new Set(
            traffic.thumbnails.map((request) => request.size),
        );
        expect(
            [...sizes].sort((a, b) => a - b),
            `${STEPS + 1} zoom steps asked for ${sizes.size} distinct sizes`,
        ).toEqual(
            [...THUMBNAIL_RUNGS]
                .filter((rung) => sizes.has(rung))
                .sort((a, b) => a - b),
        );
        expect(sizes.size).toBeLessThanOrEqual(THUMBNAIL_RUNGS.length);
    });

    test('never blanks crossing the pyramid boundary, even on a slow service', async ({
        page,
    }) => {
        // **The handover.** Blur-up holds within the pyramid tier and held
        // nowhere at the boundary out of it: crossing `pyramidThreshold`
        // released every tile the canvas had while its thumbnail had not been
        // asked for yet, so `tileDraws` went empty for a whole round trip. The
        // reader zoomed out one notch and the page vanished for the better part
        // of a second, then came back soft.
        //
        // Invisible to every other test in this file, and that is the point: the
        // fixture service answers in single-digit milliseconds, so the gap is one
        // dropped frame here and a second on a real IIIF endpoint. The latency
        // has to be injected for the defect to be observable at all.
        //
        // Delayed by SIZE, and only the thumbnail rungs — 32/64/128/256/512
        // against the pyramid's own whole-image levels of 1200/600/300/150, the
        // disjoint sets this file's header describes. Delaying every `full/`
        // request would hold up the base LEVEL too, and then there is genuinely
        // nothing held to carry and the test would be asserting the impossible.
        // A viewport small enough that the boundary is on the reader's side of
        // their own zoom floor. That floor is `MIN_ZOOM_FRACTION` of the scale
        // at which ONE folio fits, so on a tall window a folio still measures
        // more than `pyramidThreshold` when the reader has zoomed out as far as
        // the viewer will let them — and no gesture can reach the tier this
        // test is about. Sized here rather than assumed, so the crossing is a
        // gesture a reader could actually make.
        await page.setViewportSize({ width: 640, height: 480 });

        await page.route('**/iiif-fixture/**', async (route) => {
            const size = Number(
                route
                    .request()
                    .url()
                    .match(/\/full\/(\d+),/)?.[1] ?? 0,
            );
            if (THUMBNAIL_RUNGS.includes(size)) {
                await new Promise((resolve) => setTimeout(resolve, 1200));
            }
            await route.continue();
        });

        await open(page);
        // Framed in the PYRAMID tier and settled there, so the base level is
        // genuinely held before the zoom-out starts.
        await setView(page, {
            centre: {
                x: 400 * PITCH + CONTINUOUS_PAGE.width / 2,
                y: CONTINUOUS_PAGE.height / 2,
            },
            scale: 600 / CONTINUOUS_PAGE.height,
        });
        await nextPaint(page);
        await settled(() => getStats(page).then((s) => s.residentTileCount));
        expect(await countOpaqueSurfacePixels(page)).toBeGreaterThan(0);

        // Out across the threshold, in one animated glide.
        //
        // The notch count is derived rather than written down. How far one
        // notch carries the reader is a tunable, and a literal that no longer
        // reaches the boundary does not fail here — it makes the sampling above
        // vacuous, which is the one way this test can pass while proving
        // nothing. One notch of headroom past the crossing.
        const view = await getView(page);
        const crossing =
            Math.log(
                (PAGE_EXTENT * view.scale) / DEFAULT_BUDGETS.pyramidThreshold,
            ) / Math.log(DEFAULT_ZOOM_PER_WHEEL_NOTCH);
        for (let notch = 0; notch <= Math.ceil(crossing); notch += 1) {
            await page.mouse.move(view.width / 2, view.height / 2);
            await page.mouse.wheel(0, WHEEL_NOTCH_PIXELS);
        }

        // Sampled right through the round trip the thumbnail now takes. Not once
        // at the end: the defect was transient, so an assertion that only looks
        // after the thumbnail lands cannot see it.
        for (let sample = 0; sample < 16; sample += 1) {
            await page.waitForTimeout(100);
            expect(
                await countOpaqueSurfacePixels(page),
                `the canvas was blank ${sample * 100}ms into the handover`,
            ).toBeGreaterThan(0);
        }

        // It really did cross the boundary — otherwise the above is vacuous.
        const residency = await getResidency(page);
        expect(residency.pyramid).toEqual([]);
        expect(residency.thumbnail.length).toBeGreaterThan(0);
    });

    test('issues no thumbnail or metadata request while a gesture is in flight', async ({
        page,
    }) => {
        // **The view-stable gate.** A flick passes over hundreds of folios that
        // are never dwelt on; asking for each one on its way past is most of the
        // request storm on its own.
        await open(page);
        const traffic = watchTraffic(page);
        await frameThumbnails(page, 400);
        // Settled on the TRAFFIC, not on the renderer's counters. A request
        // asked for while the view was stable goes on draining out of the
        // bounded window for as long as its turn takes, and one of those
        // arriving mid-drag would be indistinguishable from the gate leaking.
        // Watching what actually leaves is the only way to tell them apart.
        await settled(async () => traffic.thumbnails.length);
        traffic.reset();

        const view = await getView(page);
        const box = await page
            .locator('[data-testid="canvas-renderer-surface"]')
            .boundingBox();
        if (!box) throw new Error('surface has no box');

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        // A long drag across many folios, with the button still held.
        for (let step = 1; step <= 20; step += 1) {
            await page.mouse.move(
                box.x + box.width / 2 - step * 40,
                box.y + box.height / 2,
            );
        }
        await nextPaint(page);

        expect(
            traffic.thumbnails,
            'a thumbnail was asked for mid-gesture',
        ).toEqual([]);
        expect(traffic.infoJson).toEqual([]);
        // The drag really did travel — otherwise the silence above is vacuous.
        expect((await getView(page)).centre.x).not.toBeCloseTo(
            view.centre.x,
            0,
        );

        // …and the moment the hand leaves, the folios it stopped on are asked
        // for. Silence must be a gate, not a failure.
        await page.mouse.up();
        await expect
            .poll(() => traffic.thumbnails.length, { timeout: 20_000 })
            .toBeGreaterThan(0);
    });

    test('asks centre-out, within the bounded in-flight window', async ({
        page,
    }) => {
        await open(page);
        // The opening fit's own tiles, drained before anything is watched.
        // Framing below is a viewport change, so whatever is still in flight
        // when it lands gets ABORTED — and an aborted request is rejected in
        // the page at once but reported to this process as `requestfailed`
        // tens of milliseconds later. Counted from those events, it reads as
        // in-flight throughout that gap, so the peak below would be the
        // window plus the opening's leftovers and the bound would be
        // unassertable. See `watchTraffic` for why the lag is nobody's fault.
        await settled(() => getStats(page).then((s) => s.tileRequestCount));

        const traffic = watchTraffic(page);

        const CENTRE = 400;
        await frameThumbnails(page, CENTRE);
        await settled(() => getStats(page).then((s) => s.tileRequestCount));

        expect(traffic.thumbnails.length).toBeGreaterThan(4);

        // Centre-out: the folio under the viewport centre is asked for before
        // the ones at the edges of the screen. Not FIFO, and not discovery
        // order — which on this fixture would start at folio 393.
        const order = traffic.thumbnails.map((request) => request.index);
        expect(Math.abs(order[0] - CENTRE)).toBeLessThanOrEqual(1);
        const firstHalf = order.slice(0, Math.ceil(order.length / 2));
        const worstEarly = Math.max(
            ...firstHalf.map((index) => Math.abs(index - CENTRE)),
        );
        const furthest = Math.max(
            ...order.map((index) => Math.abs(index - CENTRE)),
        );
        expect(
            worstEarly,
            `the nearer half arrived no later than the further half`,
        ).toBeLessThan(furthest);

        // The window is bounded, and shared with the tiles: the previous
        // renderer capped concurrency at nothing at all.
        expect(traffic.peakInFlight).toBeLessThanOrEqual(TILE_IN_FLIGHT_LIMIT);
    });

    test('holds thumbnails under the stated decoded-byte budget', async ({
        page,
    }) => {
        // Thumbnails are decoded pixels like any other, and they go through the
        // one byte-budgeted scheduler rather than beside it — which is the whole
        // reason a canvas that scrolls away gives its thumbnail back.
        await open(page);

        let peak = 0;
        for (let folio = 200; folio <= 240; folio += 8) {
            await frameThumbnails(page, folio);
            const stats = await getStats(page);
            peak = Math.max(peak, stats.decodedBytes);
            expect(stats.decodedBytes).toBeLessThanOrEqual(stats.byteBudget);
        }

        // Something really was held, so the assertion above is not vacuous.
        expect(peak).toBeGreaterThan(0);
    });
});
