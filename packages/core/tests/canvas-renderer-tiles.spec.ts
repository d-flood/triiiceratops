/**
 * Tiled deep zoom.
 *
 * What is asserted here is what only a browser can answer: network behaviour
 * (how many requests, in what order, cancelled or not) and painted pixels (blur
 * -up coverage, tile seams). Ordering policy, the cancellation rule, cache keys
 * and the negative cache are decisions over planner output and are unit-tested
 * against a fake fetch in `src/lib/renderer/*.test.ts`; nothing is duplicated
 * here.
 *
 * The fixture is a fake IIIF level 2 service on the dev server
 * (`scripts/iiifFixturePlugin.mjs`) painting the SAME numbered grid the static
 * fixture uses, so the geometric expectations carry over verbatim.
 *
 * Chromium only: everything here is scheduling and coordinate maths, and
 * widening the matrix would buy noise rather than coverage.
 */

import { expect, test, type Page, type Request } from '@playwright/test';

import {
    CHOICE_MANIFEST,
    expectFeatureOnModel,
    findFeature,
    getStats,
    getView,
    GRID_FEATURES,
    nextPaint,
    openRendererManifest,
    openTiledManifest,
    setByteBudget,
    setView,
    TILED_MANIFEST,
    TILED_V2_MANIFEST,
} from './helpers/numberedGrid';
import { E2E_ALIAS_ORIGIN, E2E_ORIGIN } from './helpers/origin';

const SURFACE = '[data-testid="canvas-renderer-surface"]';

/**
 * Tile requests, distinguished from any other image the page may fetch.
 *
 * The quality segment is deliberately left open. Pinned to `default` this would
 * silently stop matching if the renderer ever asked for `native` again — the
 * exact regression that blanks a strictly-2.1 service — so the pattern must see
 * every tile request, not only the well-formed ones.
 */
const TILE_PATTERN = /\/iiif-fixture\/[^/]+\/[^/]+\/[^/]+\/0\/[^/]+\.png$/;
const INFO_PATTERN = /\/iiif-fixture\/[^/]+\/info\.json$/;
const NO_CORS_SERVICE = `${E2E_ALIAS_ORIGIN}/iiif-fixture/no-cors`;

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'The tiled renderer slice is Chromium-only.',
);

/**
 * The region a tile URL asks for, in image pixels — `null` for the whole image.
 *
 * Parsed rather than assumed so an ordering assertion can be about *where* a
 * tile is, which is the property that matters, rather than about the shape of
 * the URL.
 */
function tileRegion(
    url: string,
): { x: number; y: number; width: number; height: number } | null {
    const match = url.match(/\/iiif-fixture\/[^/]+\/([^/]+)\//);
    if (!match) return null;
    if (match[1] === 'full') {
        return { x: 0, y: 0, width: 1200, height: 900 };
    }
    const parts = match[1].split(',').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
        return null;
    }
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function recordRequests(page: Page, pattern: RegExp): string[] {
    const urls: string[] = [];
    page.on('request', (request: Request) => {
        if (pattern.test(request.url())) urls.push(request.url());
    });
    return urls;
}

/** The alpha channel at a canvas-local CSS pixel. 0 means nothing was painted. */
async function alphaAt(page: Page, x: number, y: number): Promise<number> {
    return page.locator(SURFACE).evaluate(
        (element, point) => {
            const canvas = element as HTMLCanvasElement;
            const ctx = canvas.getContext('2d')!;
            const scaleX = canvas.width / canvas.clientWidth;
            const scaleY = canvas.height / canvas.clientHeight;
            return ctx.getImageData(
                Math.round(point.x * scaleX),
                Math.round(point.y * scaleY),
                1,
                1,
            ).data[3];
        },
        { x, y },
    );
}

test.describe('Canvas2D renderer — tiled deep zoom', () => {
    test('renders tiles from a server that does not grant CORS', async ({
        page,
    }) => {
        const requestTypes: string[] = [];
        page.on('request', (request) => {
            if (request.url().startsWith(`${NO_CORS_SERVICE}/`)) {
                requestTypes.push(request.resourceType());
            }
        });
        await page.route(`${E2E_ORIGIN}/no-cors-manifest.json`, (route) =>
            route.fulfill({
                json: {
                    id: `${E2E_ORIGIN}/no-cors-manifest.json`,
                    type: 'Manifest',
                    items: [
                        {
                            id: `${E2E_ORIGIN}/no-cors/canvas`,
                            type: 'Canvas',
                            width: 1200,
                            height: 900,
                            items: [
                                {
                                    id: `${E2E_ORIGIN}/no-cors/page`,
                                    type: 'AnnotationPage',
                                    items: [
                                        {
                                            id: `${E2E_ORIGIN}/no-cors/annotation`,
                                            type: 'Annotation',
                                            motivation: 'painting',
                                            target: `${E2E_ORIGIN}/no-cors/canvas`,
                                            body: {
                                                id: `${NO_CORS_SERVICE}/full/max/0/default.png`,
                                                type: 'Image',
                                                width: 1200,
                                                height: 900,
                                                service: [
                                                    {
                                                        id: NO_CORS_SERVICE,
                                                        type: 'ImageService3',
                                                        profile: 'level2',
                                                    },
                                                ],
                                            },
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            }),
        );

        await page.goto('/?manifest=/no-cors-manifest.json', {
            waitUntil: 'domcontentloaded',
        });
        await page.locator(SURFACE).waitFor({ state: 'visible' });

        await expect
            .poll(async () => (await getStats(page)).residentTileCount, {
                timeout: 20_000,
            })
            .toBeGreaterThan(0);
        expect(requestTypes).toContain('image');

        // The fallback restores the old renderer's display compatibility, and
        // the browser enforces the same security boundary it did there: once a
        // no-CORS image is drawn, pixel readback from that surface is forbidden.
        await expect
            .poll(() =>
                page.locator(SURFACE).evaluate((element) => {
                    const canvas = element as HTMLCanvasElement;
                    try {
                        canvas.getContext('2d')!.getImageData(0, 0, 1, 1);
                        return false;
                    } catch (error) {
                        return (
                            error instanceof DOMException &&
                            error.name === 'SecurityError'
                        );
                    }
                }),
            )
            .toBe(true);
    });

    test('opening a single-canvas view issues exactly one info.json request', async ({
        page,
    }) => {
        const infoRequests = recordRequests(page, INFO_PATTERN);

        await page.goto(`/?manifest=${TILED_MANIFEST}`, {
            waitUntil: 'domcontentloaded',
        });
        await page.locator(SURFACE).waitFor({ state: 'visible' });
        await expect
            .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
            .not.toBeNull();

        // Several frames' worth of planning, each of which re-emits the same
        // metadata request. The cache is what makes that one fetch — the old
        // renderer's `Promise.all` over every source is what this replaces.
        await nextPaint(page);
        await nextPaint(page);

        expect(infoRequests).toEqual([
            expect.stringContaining('/iiif-fixture/one/info.json'),
        ]);
    });

    test('revisiting a canvas issues no second metadata request', async ({
        page,
    }) => {
        const infoRequests = recordRequests(page, INFO_PATTERN);

        await page.goto(`/?manifest=${TILED_MANIFEST}`, {
            waitUntil: 'domcontentloaded',
        });
        await expect
            .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
            .not.toBeNull();

        await page.getByLabel('Next Canvas').click();
        await expect
            .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
            .not.toBeNull();
        await page.getByLabel('Previous Canvas').click();
        await expect
            .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
            .not.toBeNull();

        // Metadata and decoded pixels are two caches with two lifetimes: the
        // tiles were released on the way out, the facts were not.
        const first = infoRequests.filter((url) =>
            url.includes('/iiif-fixture/one/'),
        );
        expect(first).toHaveLength(1);
    });

    test('asks the selected Choice’s service for tiles, not the first alternative forever', async ({
        page,
    }) => {
        // A canvas id is not a stable name for a picture: selecting a different
        // Choice resolves the same canvas to a different service, and anything
        // keyed on the id alone therefore serves the previous alternative back
        // forever. `imageRequests` already says so for whole decoded images;
        // this is the same claim for tiles and for image-service facts, which is
        // the half that was keyed on the canvas.
        //
        // Asserted on the network rather than on pixels, deliberately: both
        // alternatives of the fixture are the same grid, so "which service was
        // asked" is the only observation that distinguishes them — and it is
        // also the exact thing that was wrong. A pixel assertion would need two
        // distinguishable fixture images and would still be asserting this.
        const tileRequests = recordRequests(page, TILE_PATTERN);
        const infoRequests = recordRequests(page, INFO_PATTERN);

        await openRendererManifest(page, CHOICE_MANIFEST);
        await nextPaint(page);

        const asked = (urls: string[], service: string) =>
            urls.filter((url) => url.includes(`/iiif-fixture/${service}/`));

        // The first alternative is what an unselected Choice paints.
        expect(asked(tileRequests, 'choice-natural').length).toBeGreaterThan(0);
        expect(asked(infoRequests, 'choice-natural')).toHaveLength(1);
        expect(asked(tileRequests, 'choice-xray')).toHaveLength(0);

        await page
            .locator('.choice-join button[aria-label="2: X-Ray"]')
            .click({ timeout: 20_000 });

        // Its facts are fetched — the metadata record cannot answer for a
        // service it never saw, however much it knows about this canvas…
        await expect
            .poll(() => asked(infoRequests, 'choice-xray').length, {
                timeout: 20_000,
            })
            .toBe(1);
        // …and its tiles are actually requested, which is what the reader sees.
        await expect
            .poll(() => asked(tileRequests, 'choice-xray').length, {
                timeout: 20_000,
            })
            .toBeGreaterThan(0);

        // Deliberately NOT asserted here: that switching back costs no request.
        // Whether the first alternative's tiles are still held depends on
        // whether its load had finished before the switch — the scheduler aborts
        // what leaves the required set — so it is a claim about timing dressed
        // up as one about the cache. Retention across a required-set change is
        // `tileScheduler.test.ts`'s, against a fake fetch.
    });

    test('lands a named feature on its predicted screen pixel within 1px at deep zoom', async ({
        page,
    }) => {
        await openTiledManifest(page);

        // Well past the fit scale, so the current level is full resolution and
        // the feature is painted from several tiles' worth of pyramid.
        for (const scale of [0.5, 1.5, 4]) {
            await setView(page, { centre: GRID_FEATURES.alpha, scale });

            // Polled, not asserted once: the first frame at a new zoom is
            // deliberately the coarse chain magnified — that is blur-up — and a
            // marker resampled up from level 0 has a centroid good to a coarse
            // pixel, not to a screen one. What is asserted is that the current
            // level lands and brings the feature onto its predicted pixel.
            await expect
                .poll(
                    async () => {
                        const view = await getView(page);
                        const found = await findFeature(page, 'alpha');
                        if (!found) return Infinity;
                        const expected = {
                            x:
                                (GRID_FEATURES.alpha.x - view.centre.x) *
                                    view.scale +
                                view.width / 2,
                            y:
                                (GRID_FEATURES.alpha.y - view.centre.y) *
                                    view.scale +
                                view.height / 2,
                        };
                        return Math.max(
                            Math.abs(found.x - expected.x),
                            Math.abs(found.y - expected.y),
                        );
                    },
                    { timeout: 20_000 },
                )
                .toBeLessThanOrEqual(1);
        }
    });

    test('never blanks while zooming from fit to full resolution', async ({
        page,
    }) => {
        await openTiledManifest(page);
        const view = await getView(page);
        const centre = { x: view.width / 2, y: view.height / 2 };

        // `setView` resolves on the very NEXT painted frame, so at each step
        // the tiles for the newly promoted level cannot have arrived yet. That
        // the centre is still painted is blur-up doing its job: the coarse
        // chain is resident and gets painted underneath.
        for (const scale of [0.4, 0.8, 1.6, 3.2, 6.4]) {
            await setView(page, { centre: GRID_FEATURES.bravo, scale });
            expect(
                await alphaAt(page, centre.x, centre.y),
                `blank at scale ${scale}`,
            ).toBeGreaterThan(0);
        }
    });

    test('zooming back out is immediate: the coarse chain is still resident', async ({
        page,
    }) => {
        await openTiledManifest(page);
        const view = await getView(page);
        const centre = { x: view.width / 2, y: view.height / 2 };

        await setView(page, { centre: GRID_FEATURES.bravo, scale: 6.4 });
        await expect
            .poll(() => getStats(page).then((stats) => stats.residentTileCount))
            .toBeGreaterThan(1);

        // Straight back out, and read the first frame painted there. Nothing
        // has been fetched in between, so anything on screen was already held.
        await setView(page, { centre: GRID_FEATURES.bravo, scale: 0.4 });
        expect(await alphaAt(page, centre.x, centre.y)).toBeGreaterThan(0);
        await expectFeatureOnModel(page, 'bravo', 1);
    });

    test('asks for the tile under the viewport centre first, not the first one discovered', async ({
        page,
    }) => {
        await openTiledManifest(page);
        await expect
            .poll(() => getStats(page).then((stats) => stats.tileRequestCount))
            .toBeGreaterThan(0);

        // Zoomed right out first, so the current level is a couple of tiles and
        // everything finer is released. This fixture is small enough that the
        // fit view already holds its full-resolution level whole — without this,
        // zooming in requires a SUBSET of what is already resident and there is
        // no ordering left to observe.
        //
        // And with the byte budget at zero, because a tile that
        // leaves the required set is held in the **opportunistic cache** rather
        // than closed — so zooming back in would be answered from memory with
        // no requests at all, and there would again be no ordering to observe.
        // What is under test is the priority queue, not the cache.
        await setByteBudget(page, 0);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.2 });
        for (let frame = 0; frame < 3; frame += 1) await nextPaint(page);

        const requested = recordRequests(page, TILE_PATTERN);
        // Off-centre on purpose: a scheduler that started at the top-left of
        // the grid, or that kept discovery order, would pass a centred test.
        const centre = { x: 500, y: 400 };
        await setView(page, { centre, scale: 2.5 });
        await expect.poll(() => requested.length).toBeGreaterThanOrEqual(6);

        // The window is fed straight off the priority queue, so the first
        // requests to leave it are in centre-out order. Distances are measured
        // in image space, which is this fixture's canvas space too — and to the
        // NEAREST POINT of each tile, not to its centre, because a coarse tile
        // covering the viewport centre is what blur-up needs first however far
        // away its own centre is.
        const distances = requested.slice(0, 6).map((url) => {
            const region = tileRegion(url)!;
            const nearest = {
                x: Math.min(
                    Math.max(centre.x, region.x),
                    region.x + region.width,
                ),
                y: Math.min(
                    Math.max(centre.y, region.y),
                    region.y + region.height,
                ),
            };
            return Math.hypot(nearest.x - centre.x, nearest.y - centre.y);
        });

        expect(
            distances,
            `not centre-out: ${requested.slice(0, 6).join('\n')}`,
        ).toEqual([...distances].sort((a, b) => a - b));
    });

    test('keeps in-flight tile requests inside the configured window', async ({
        page,
    }) => {
        let active = 0;
        let peak = 0;
        await page.route(TILE_PATTERN, async (route) => {
            active += 1;
            peak = Math.max(peak, active);
            // Held open long enough that the renderer would run ahead of the
            // window if it had none.
            await new Promise((resolve) => setTimeout(resolve, 120));
            active -= 1;
            await route.continue();
        });

        await page.goto(`/?manifest=${TILED_MANIFEST}`, {
            waitUntil: 'domcontentloaded',
        });
        await page.locator(SURFACE).waitFor({ state: 'visible' });
        await expect
            .poll(() => findFeature(page, 'bravo'), { timeout: 30_000 })
            .not.toBeNull();

        // A zoom asks for far more tiles than the window can hold at once.
        await setView(page, { centre: GRID_FEATURES.bravo, scale: 4 });
        await expect.poll(() => peak, { timeout: 30_000 }).toBeGreaterThan(1);

        expect(peak).toBeLessThanOrEqual(6);
    });

    test('aborts superseded tile requests rather than completing them', async ({
        page,
    }) => {
        // Slow tiles, so a request is still outstanding when the view moves on.
        await page.route(TILE_PATTERN, async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 400));
            await route.continue();
        });

        const aborted: string[] = [];
        page.on('requestfailed', (request) => {
            if (!TILE_PATTERN.test(request.url())) return;
            if (request.failure()?.errorText.includes('ABORTED')) {
                aborted.push(request.url());
            }
        });

        await page.goto(`/?manifest=${TILED_MANIFEST}`, {
            waitUntil: 'domcontentloaded',
        });
        await page.locator(SURFACE).waitFor({ state: 'visible' });
        await expect
            .poll(() => findFeature(page, 'bravo'), { timeout: 30_000 })
            .not.toBeNull();

        // A fast pan across the image: each step supersedes the last step's
        // required set while its tiles are still in flight.
        await setView(page, { centre: { x: 150, y: 150 }, scale: 4 });
        for (const x of [400, 700, 1000, 700, 400, 150]) {
            await setView(page, { centre: { x, y: 150 }, scale: 4 });
        }

        await expect
            .poll(() => aborted.length, { timeout: 30_000 })
            .toBeGreaterThan(0);
    });

    test('requests a failing tile at most twice, ever', async ({ page }) => {
        // One tile of the full-resolution level, chosen by its region so the
        // choice survives any change in how a URL is spelled.
        const brokenTile = /\/iiif-fixture\/one\/512,256,256,256\//;
        const attempts: string[] = [];
        await page.route(brokenTile, async (route) => {
            attempts.push(route.request().url());
            await route.fulfill({ status: 404, body: 'gone' });
        });

        await page.goto(`/?manifest=${TILED_MANIFEST}`, {
            waitUntil: 'domcontentloaded',
        });
        await page.locator(SURFACE).waitFor({ state: 'visible' });
        await expect
            .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
            .not.toBeNull();

        // Sit at a zoom where that tile is required, across many frames. Without
        // a permanent negative entry it would be re-requested on every one.
        await setView(page, { centre: GRID_FEATURES.bravo, scale: 4 });
        await expect.poll(() => attempts.length).toBeGreaterThan(0);
        for (let frame = 0; frame < 20; frame += 1) await nextPaint(page);

        expect(attempts).toHaveLength(2);
    });

    /**
     * Coverage, not seams.
     *
     * The seam claim itself is asserted where it can fail — `drawTile`'s
     * destination rectangles, in `src/lib/renderer/paintScene.test.ts`. It
     * cannot be asserted from here: blur-up paints the coarse chain underneath
     * first, so every in-image pixel is opaque before a single current-level
     * tile is drawn, and a real seam under blur-up is a one-pixel line of the
     * COARSE level's colour rather than a hole. What this still proves is worth
     * keeping — that the tiled path covers the viewport at an awkward zoom at
     * all — so it is kept under a name that matches it.
     */
    test('covers the viewport with no gap at fractional zoom', async ({
        page,
    }) => {
        await openTiledManifest(page);

        // A deliberately awkward scale and centre: whole-numbered ones snap
        // tile edges onto device pixels for free and would hide the bug.
        await setView(page, {
            centre: { x: 613.37, y: 451.19 },
            scale: 1.7321,
        });
        // Let the level fill in, so the scan crosses real tile boundaries
        // rather than one stretched coarse tile.
        await expect
            .poll(
                () => getStats(page).then((stats) => stats.residentTileCount),
                {
                    timeout: 20_000,
                },
            )
            .toBeGreaterThan(4);
        await nextPaint(page);

        // The canvas never paints a background, so anything the painter left
        // uncovered reads as alpha 0.
        const gaps = await page.locator(SURFACE).evaluate((element) => {
            const canvas = element as HTMLCanvasElement;
            const ctx = canvas.getContext('2d')!;
            const { data } = ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
            );

            let transparent = 0;
            const y = Math.floor(canvas.height / 2);
            for (let x = 0; x < canvas.width; x += 1) {
                if (data[(y * canvas.width + x) * 4 + 3] === 0)
                    transparent += 1;
            }
            return transparent;
        });

        // The image more than covers the viewport at this zoom, so every pixel
        // of the scanline is inside it.
        expect(gaps).toBe(0);
    });

    test('loads tiles from a strict Image API 2.1 service', async ({
        page,
    }) => {
        const rejected: string[] = [];
        page.on('response', (response) => {
            if (!TILE_PATTERN.test(response.url())) return;
            if (response.status() >= 400) rejected.push(response.url());
        });

        await page.goto(`/?manifest=${TILED_V2_MANIFEST}`, {
            waitUntil: 'domcontentloaded',
        });
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 20_000 });

        // The fixture rejects any quality but `default`, as 2.1 requires. Ask it
        // for the deprecated `native` and every tile 4xxs, each spends its one
        // retry, the URLs land in the permanent negative cache, and no feature
        // is ever findable.
        await expect
            .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
            .not.toBeNull();
        await setView(page, { centre: GRID_FEATURES.alpha, scale: 2 });
        await expectFeatureOnModel(page, 'alpha', 1);

        expect(rejected).toEqual([]);
    });

    test('reports resident tiles and decoded bytes, and they follow what is held', async ({
        page,
    }) => {
        await openTiledManifest(page);

        // With no opportunistic cache, so `decodedBytes` is exactly the
        // required set. The counter reports everything held —
        // cache included, deliberately, because a counter that saw only the
        // required set would read comfortably low while the cache was the thing
        // filling memory. What this test is about is that the counters follow
        // RESIDENCY, so the cache is turned off here and asserted separately
        // (`canvas-renderer-continuous.spec.ts`, `tileScheduler.test.ts`).
        await setByteBudget(page, 0);

        const atFit = await getStats(page);
        expect(atFit.residentTileCount).toBeGreaterThan(0);
        expect(atFit.decodedBytes).toBeGreaterThan(0);
        expect(atFit.cachedTileCount).toBe(0);

        // Zoomed right out: the current level is a couple of tiles and every
        // finer one is released — bytes with them. Decoded bytes track the
        // tiles, not the request history, and browser heap metrics could not see
        // this at all, since decoded images live outside the JS heap.
        await setView(page, { centre: GRID_FEATURES.bravo, scale: 0.2 });
        await expect
            .poll(
                () => getStats(page).then((stats) => stats.residentTileCount),
                { timeout: 20_000 },
            )
            .toBeLessThan(atFit.residentTileCount);

        const out = await getStats(page);
        expect(out.decodedBytes).toBeLessThan(atFit.decodedBytes);

        // Back in, and the current level is held again — over
        // viewport-plus-margin, not over the whole image.
        await setView(page, { centre: GRID_FEATURES.bravo, scale: 4 });
        await expect
            .poll(
                () => getStats(page).then((stats) => stats.residentTileCount),
                { timeout: 20_000 },
            )
            .toBeGreaterThan(out.residentTileCount);

        const zoomed = await getStats(page);
        expect(zoomed.decodedBytes).toBeGreaterThan(out.decodedBytes);
        expect(
            zoomed.decodedBytes / zoomed.residentTileCount,
        ).toBeLessThanOrEqual(
            // Nothing bigger than one 256x256 RGBA tile per resident tile.
            256 * 256 * 4,
        );
    });
});
