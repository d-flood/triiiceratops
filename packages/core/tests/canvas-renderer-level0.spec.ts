/**
 * Seam 2 — level0 sources (ticket 06).
 *
 * Both level0 shapes, end to end in a real browser:
 *
 * - a level0 service that advertises **tiles** is an ordinary pyramid whose
 *   levels are restricted to the advertised scale factors;
 * - a level0 service that advertises only **sizes** is a **size-ladder source**:
 *   no tiling ever, one whole image per rung.
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
 * so ticket 04's geometric expectations carry over unchanged.
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
    LEVEL0_TILED_MANIFEST,
    nextPaint,
    openRendererManifest,
    setView,
} from './helpers/numberedGrid';

const IMAGE_PATTERN = /\/iiif-fixture\/l0-[^/]+\/[^/]+\/[^/]+\/0\/[^/]+\.png$/;

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

        // Far enough out that the canvas leaves the pyramid tier entirely. The
        // per-rung rules nest inside the canvas tier exactly as the per-level
        // ones do, so everything — including the coarsest rung — is released.
        await setView(page, { centre: GRID_FEATURES.bravo, scale: 0.01 });
        await expect
            .poll(
                async () => {
                    await nextPaint(page);
                    return (await getStats(page)).decodedBytes;
                },
                { timeout: 20_000 },
            )
            .toBe(0);
    });
});
