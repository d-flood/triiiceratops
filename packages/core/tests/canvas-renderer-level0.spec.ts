/**
 * Level0 sources, end to end in a real browser:
 *
 * - a level0 service that advertises **tiles** is an ordinary pyramid whose
 *   levels are restricted to the advertised scale factors;
 * - a level0 service that advertises only **sizes** is a **size-ladder source**:
 *   no tiling ever, one whole image per rung.
 *
 * A third fixture covers the shape the renderer's `default`-over-`native`
 * quality choice gets wrong — a frozen pre-2016 version 2 tree — because for a
 * ladder that is not a blurrier canvas but a permanently blank one.
 *
 * What makes these tests worth running rather than duplicating the planner's
 * unit tests is the fixture service (`scripts/iiifFixturePlugin.mjs`), which
 * behaves like a real level0 endpoint: it is a tree of pre-generated files, so
 * anything it did not advertise is a **404**. A renderer that invents a scale
 * factor, asks a size-ladder service for a region, or asks for a size outside
 * the ladder does not get a slightly-wrong picture — it gets no picture. The
 * geometric assertion is therefore also the URL assertion.
 *
 * Both fixtures paint the same numbered grid as every other renderer fixture,
 * so the geometric expectations carry over unchanged.
 *
 * Chromium only, for the same reason as the tiled slice: this is scheduling and
 * coordinate maths, and widening the matrix would buy noise.
 */

import { expect, test, type Page, type Request } from '@playwright/test';

import {
    expectFeatureOnModel,
    findFeature,
    getStats,
    GRID_FEATURES,
    LEVEL0_SIZES_MANIFEST,
    LEVEL0_SIZES_V2_MANIFEST,
    LEVEL0_TILED_MANIFEST,
    nextPaint,
    openRendererManifest,
    setByteBudget,
    setView,
} from './helpers/numberedGrid';

const IMAGE_PATTERN =
    /\/iiif-fixture\/l0-[^/]+\/[^/]+\/[^/]+\/0\/[^/]+\.(png|jpg)$/;

/** The advertised whole-image widths of both fixtures, over a 1200x900 grid. */
const ADVERTISED_WIDTHS = [1200, 600, 300, 150];

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'The level0 renderer slice is Chromium-only.',
);

interface FixtureTraffic {
    /** Every image URL asked for, aborted ones included. */
    asked: string[];
    /** Every image request that got an answer, with its status. */
    answered: Array<{ url: string; status: number }>;
}

/**
 * Two lists, because the two questions are different.
 *
 * *Which* URL was asked for must include the requests the scheduler aborts —
 * aborting on supersede is correct behaviour, and a malformed URL is just as
 * wrong for having been cancelled. *Whether the service held the file* can only
 * be asked of a request that got an answer, and an abort has no status.
 */
function recordTraffic(page: Page): FixtureTraffic {
    const traffic: FixtureTraffic = { asked: [], answered: [] };

    page.on('request', (request: Request) => {
        if (IMAGE_PATTERN.test(request.url()))
            traffic.asked.push(request.url());
    });
    page.on('response', (response) => {
        const url = response.url();
        if (IMAGE_PATTERN.test(url)) {
            traffic.answered.push({ url, status: response.status() });
        }
    });

    return traffic;
}

/** The `{region}/{size}` pair a fixture image request asks for. */
function requestShape(url: string): { region: string; size: string } {
    const [, region, size] = url.match(
        /\/iiif-fixture\/[^/]+\/([^/]+)\/([^/]+)\/0\//,
    )!;
    return { region, size };
}

test.describe('Canvas2D renderer — level0 with tiles', () => {
    test('renders, and never asks for an unadvertised scale factor', async ({
        page,
    }) => {
        const traffic = recordTraffic(page);
        await openRendererManifest(page, LEVEL0_TILED_MANIFEST);

        // Zoom right through the pyramid. Every level the renderer selects has
        // to correspond to an advertised factor: this service holds no file for
        // any other, and answers 404.
        for (const scale of [0.4, 1, 2, 4]) {
            await setView(page, { centre: GRID_FEATURES.bravo, scale });
            await nextPaint(page);
        }

        expect(traffic.answered.length).toBeGreaterThan(0);
        for (const { url, status } of traffic.answered) {
            expect(status, `${url} was not served`).toBe(200);
        }
    });

    test('lands a named feature on its predicted screen pixel at deep zoom', async ({
        page,
    }) => {
        await openRendererManifest(page, LEVEL0_TILED_MANIFEST);
        await setView(page, { centre: GRID_FEATURES.alpha, scale: 3 });

        await expect
            .poll(() => findFeature(page, 'alpha'), { timeout: 20_000 })
            .not.toBeNull();
        // Polled once more through `expectFeatureOnModel`: the first frame at a
        // new zoom is deliberately the coarse chain magnified (blur-up), and the
        // assertion is that the current level arrives and corrects it.
        await expect
            .poll(
                async () => {
                    try {
                        await expectFeatureOnModel(page, 'alpha');
                        return true;
                    } catch {
                        await nextPaint(page);
                        return false;
                    }
                },
                { timeout: 20_000 },
            )
            .toBe(true);
    });
});

/** The `quality` a fixture image request asks for. */
function requestQuality(url: string): string {
    return url.split('/0/')[1].split('.')[0];
}

test.describe('Canvas2D renderer — level0 ladder on a native-only version 2 tree', () => {
    test('recovers from the deprecated quality, and asks the wrong way only once per service', async ({
        page,
    }) => {
        const traffic = recordTraffic(page);

        // Opening at all is half the assertion. `openRendererManifest` waits
        // for a grid feature to be on the canvas, and this service holds no
        // `default` file at ANY rung — so without the fallback every rung 404s,
        // each burns its one retry, the negative cache closes over the whole
        // ladder, and the canvas is blank for the life of the page.
        await openRendererManifest(page, LEVEL0_SIZES_V2_MANIFEST);

        const refused = traffic.answered.filter(
            ({ url }) => requestQuality(url) === 'default',
        );
        // The happy path still asks one way: `default` is tried first, because
        // that is the right answer for every endpoint built since 2016.
        expect(refused.length).toBeGreaterThan(0);
        for (const { url, status } of refused) {
            expect(status, `${url} was unexpectedly served`).toBe(404);
        }
        expect(
            traffic.answered.some(
                ({ url, status }) =>
                    requestQuality(url) === 'native' && status === 200,
            ),
        ).toBe(true);

        // The answer is remembered for the SERVICE, not for the rung: every
        // rung fetched from here goes straight to the spelling that works, so
        // the discovery is paid for once rather than once per rung.
        //
        // Zoomed out past the box tier first, which releases the whole ladder —
        // otherwise the rungs are still resident and nothing is re-requested.
        // Down to ONE image rather than to none: the tier floor keeps the canvas
        // the reader is centred on rendering at any scale, so what is left is a
        // single thumbnail and none of the ladder.
        //
        // The byte budget goes to zero for a related reason: a rung dropped
        // from the required set moves to the **opportunistic
        // cache** rather than being closed, and a cached rung comes back with
        // no request at all — which is the right behaviour and the wrong
        // conditions for this assertion. Zero is the documented "no cache"
        // setting, and it is what makes "released" mean released here.
        await setByteBudget(page, 0);
        await setView(page, { centre: GRID_FEATURES.bravo, scale: 0.01 });
        await expect
            .poll(
                async () => {
                    await nextPaint(page);
                    return (await getStats(page)).residentTileCount;
                },
                { timeout: 20_000 },
            )
            .toBe(1);

        traffic.answered.length = 0;
        traffic.asked.length = 0;
        await setView(page, { centre: GRID_FEATURES.bravo, scale: 2 });
        await expect
            .poll(
                async () => {
                    await nextPaint(page);
                    return traffic.asked.length;
                },
                { timeout: 20_000 },
            )
            .toBeGreaterThan(0);

        for (const url of traffic.asked) {
            expect(
                requestQuality(url),
                `${url} re-asked the dead spelling`,
            ).toBe('native');
        }
    });
});

test.describe('Canvas2D renderer — level0 size-ladder source', () => {
    test('renders a service that advertises only sizes, and never tiles it', async ({
        page,
    }) => {
        const traffic = recordTraffic(page);
        await openRendererManifest(page, LEVEL0_SIZES_MANIFEST);

        for (const scale of [0.4, 1, 3]) {
            await setView(page, { centre: GRID_FEATURES.bravo, scale });
            await nextPaint(page);
        }

        expect(traffic.asked.length).toBeGreaterThan(0);
        for (const url of traffic.asked) {
            const { region, size } = requestShape(url);
            // No tiling, ever: the only region a level0 sizes-only service
            // serves is the whole image.
            expect(region, `${url} asked for a region`).toBe('full');
            expect(
                size === 'max' ||
                    ADVERTISED_WIDTHS.some((width) => size === `${width},`),
                `${url} asked for an unadvertised size`,
            ).toBe(true);
        }
        for (const { url, status } of traffic.answered) {
            expect(status, `${url} was not served`).toBe(200);
        }
    });

    test('promotes up the ladder as the canvas is magnified', async ({
        page,
    }) => {
        const traffic = recordTraffic(page);
        await openRendererManifest(page, LEVEL0_SIZES_MANIFEST);

        const sizesAsked = () =>
            new Set(traffic.asked.map((url) => requestShape(url).size));

        // Settle at a coarse view first, then forget everything the opening fit
        // asked for. What is under test is which rung THIS view requires, and
        // the whole ladder above it has been released by now.
        //
        // With the byte budget at zero, for the reason the sibling test below
        // states: a rung dropped from the required set moves to
        // the **opportunistic cache** rather than being closed, and the opening
        // fit puts the canvas above the pyramid threshold — so it asks for the
        // top rung, and magnifying back into it PROMOTES that rung out of the
        // cache with no request at all. The assertion below is about which rung
        // the ladder chooses, not about whether the cache happened to still
        // hold it, and without this the test passes or fails on cache timing.
        await setByteBudget(page, 0);
        await setView(page, { centre: GRID_FEATURES.bravo, scale: 0.35 });
        await nextPaint(page);
        await nextPaint(page);
        traffic.asked.length = 0;
        await nextPaint(page);
        await nextPaint(page);

        // A ladder that jumped straight to the top rung would defeat its own
        // purpose — and the decoded-pixel cap with it.
        expect(sizesAsked().has('max')).toBe(false);

        await setView(page, { centre: GRID_FEATURES.bravo, scale: 3 });
        await expect
            .poll(
                async () => {
                    await nextPaint(page);
                    return sizesAsked().has('max');
                },
                { timeout: 20_000 },
            )
            .toBe(true);
    });

    test('holds the ladder as decoded whole images, and releases them on the way out', async ({
        page,
    }) => {
        await openRendererManifest(page, LEVEL0_SIZES_MANIFEST);

        await setView(page, { centre: GRID_FEATURES.bravo, scale: 2 });
        await expect
            .poll(
                async () => {
                    await nextPaint(page);
                    return (await getStats(page)).residentTileCount;
                },
                { timeout: 20_000 },
            )
            .toBeGreaterThan(1);

        const zoomedIn = await getStats(page);

        // Far enough out that the canvas leaves the pyramid tier entirely. The
        // per-rung rules nest inside the canvas tier exactly as the per-level
        // ones do, so every RUNG — including the coarsest — is released, and the
        // canvas holds one thumbnail in their place. Not nothing: the tier floor
        // keeps the canvas the reader is centred on rendering at any scale, so
        // "released" here means one small image rather than a whole ladder.
        //
        // With the byte budget at zero, because "released" has
        // two stages: a rung dropped from the required set moves to the
        // **opportunistic cache** first, and is closed only when the budget
        // says so. Zero is the documented "no cache" setting, and what is under
        // test here is the tier nesting, not the cache.
        await setByteBudget(page, 0);
        await setView(page, { centre: GRID_FEATURES.bravo, scale: 0.01 });
        await expect
            .poll(
                async () => {
                    await nextPaint(page);
                    return (await getStats(page)).residentTileCount;
                },
                { timeout: 20_000 },
            )
            .toBe(1);

        const zoomedOut = await getStats(page);
        expect(zoomedOut.decodedBytes).toBeGreaterThan(0);
        // An order of magnitude down, which a ladder that kept even its coarsest
        // rung beside the thumbnail could not be.
        expect(zoomedOut.decodedBytes).toBeLessThan(zoomedIn.decodedBytes / 10);
    });
});
