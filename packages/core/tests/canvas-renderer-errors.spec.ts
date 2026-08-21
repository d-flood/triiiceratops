/**
 * Per-canvas tile-source errors, in a real browser.
 *
 * `renderer/canvasErrors.test.ts` proves the two decisions: where a placeholder
 * goes, and when a set of per-canvas failures adds up to a viewer-level
 * condition. What only a browser can show is the claim that actually
 * matters — that **one folio failing leaves the other 799 working**, which is a
 * claim about a live renderer, a live metadata cache, and the chrome that sits
 * over them, not about a pure function.
 *
 * The 800-canvas fixture is the only fixture where the claim means anything. On
 * a one-canvas manifest "the rest keeps working" is vacuous, and a viewer-wide
 * error state would pass every assertion a short fixture could make.
 *
 * ## Why the failures are injected rather than fixtured
 *
 * A `401` is a property of a request, not of a manifest, and the interesting
 * case is a single canvas out of 800 — a fixture service that failed for
 * everything would test the fail-fast behaviour this ticket replaces. Routing
 * one `info.json` is also what makes the request COUNT assertable, which is how
 * "a failed canvas is not refetched every time it re-enters the viewport" is
 * stated at all.
 *
 * ## Both source kinds, because they fail through different machinery
 *
 * A service-backed canvas fails in the metadata cache, which is module-scoped and
 * survives eviction by construction. A **static-image** canvas has no
 * `info.json` at all: it fails in an `<img>` `onerror`, and the record of it is
 * component state that the residency reconciliation clears when the canvas leaves
 * the window. The eviction clause is therefore a genuinely separate claim for it,
 * and the last journey below is the one that states it — see
 * `renderer/staticImageFailures.ts` for what makes it true.
 */

import { expect, test, type Page } from '@playwright/test';

import {
    CONTINUOUS_MANIFEST,
    CONTINUOUS_PAGE,
    continuousCanvasId,
    findFeature,
    getResidency,
    getView,
    nextPaint,
    openRendererManifest,
    setView,
    TILED_MANIFEST,
} from './helpers/numberedGrid';
import { MULTI_CANVAS_GAP_FRACTION } from '../src/lib/renderer/rendererDefaults';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const OPEN_TIMEOUT = 60_000;
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const PLACEHOLDER = '[data-testid="canvas-error-placeholder"]';
/** The VISIBLE message inside a placeholder, as distinct from its accessible name. */
const LABEL = '[data-testid="canvas-error-label"]';

/** Canvas width plus the resolved gap: where the next folio begins. */
const PITCH =
    CONTINUOUS_PAGE.width + MULTI_CANVAS_GAP_FRACTION * CONTINUOUS_PAGE.width;

/** The image service folio `index` of the continuous fixture is backed by. */
function folioService(index: number): string {
    return `**/iiif-fixture/c800-${index}/info.json`;
}

function folio(page: Page, index: number): string {
    return continuousCanvasId(index, new URL(page.url()).origin);
}

/** Frame folio `index` so the viewport is exactly one page wide. */
async function frameFolio(page: Page, index: number) {
    const view = await getView(page);
    await setView(page, {
        centre: {
            x: index * PITCH + CONTINUOUS_PAGE.width / 2,
            y: CONTINUOUS_PAGE.height / 2,
        },
        scale: view.width / CONTINUOUS_PAGE.width,
    });
    await nextPaint(page);
}

/**
 * The renderer's per-canvas error state — the source of truth, by NAME.
 *
 * Read from the host's test handle rather than inferred from the DOM, because
 * the two are different claims: this is what the renderer believes, and the
 * placeholder assertions below are what a reader can perceive of it.
 */
async function getCanvasErrors(
    page: Page,
): Promise<Record<string, 'auth' | 'load'>> {
    return page.locator(SURFACE).evaluate((element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: {
                    getCanvasErrors(): Record<string, 'auth' | 'load'>;
                };
            }
        ).__triiiceratopsRenderer;
        if (!handle) throw new Error('renderer test handle not installed');
        return handle.getCanvasErrors();
    }) as Promise<Record<string, 'auth' | 'load'>>;
}

/** Answer one folio's `info.json` with `status`, and count the asks. */
async function failFolio(
    page: Page,
    index: number,
    status: number,
): Promise<{ readonly requests: number }> {
    const counter = { requests: 0 };
    await page.route(folioService(index), async (route) => {
        counter.requests += 1;
        await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'injected' }),
        });
    });
    return counter;
}

/**
 * A many-canvas **static-image** manifest, served by route rather than checked in.
 *
 * There is no static fixture long enough for a canvas to leave the residency
 * window — the checked-in one has two canvases, and with two nothing is ever
 * evicted, which is precisely the condition this journey needs. Generated here so
 * the shape of the failure (which canvas, which URL) stays next to the assertions
 * about it, exactly as the `401` above is routed rather than fixtured.
 */
const STATIC_MANY_MANIFEST = '/demo-manifests/static-many/manifest.json';
const STATIC_MANY_COUNT = 40;
/** The folio whose image 404s, and the URL it paints. */
const STATIC_BROKEN_FOLIO = 5;
const STATIC_BROKEN_IMAGE = '/demo-manifests/static-many/missing.png';
const STATIC_GOOD_IMAGE = '/demo-manifests/static-image/numbered-grid.png';

/**
 * The id of static folio `index`, exactly as the manifest spells it.
 *
 * Relative, unlike `folio` above: the continuous fixture's own ids are absolute
 * because the fixture plugin writes them that way, and the viewer carries a canvas
 * id through as the manifest gave it.
 */
function staticFolio(index: number): string {
    return `/demo-manifests/static-many/canvas/${index}`;
}

/**
 * Serve the static manifest, and answer its one broken image with a 404 while
 * counting the asks.
 *
 * Every canvas is the numbered grid at the CONTINUOUS fixture's dimensions, so
 * `frameFolio` frames these folios too and the geometry needs no second set of
 * numbers.
 */
async function routeStaticManifest(
    page: Page,
): Promise<{ readonly requests: number }> {
    await page.route(`**${STATIC_MANY_MANIFEST}`, async (route) => {
        const items = Array.from({ length: STATIC_MANY_COUNT }, (_, index) => ({
            id: `/demo-manifests/static-many/canvas/${index}`,
            type: 'Canvas',
            label: { en: [`Folio ${index}`] },
            width: CONTINUOUS_PAGE.width,
            height: CONTINUOUS_PAGE.height,
            items: [
                {
                    id: `/demo-manifests/static-many/page/${index}`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `/demo-manifests/static-many/annotation/${index}`,
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id:
                                    index === STATIC_BROKEN_FOLIO
                                        ? STATIC_BROKEN_IMAGE
                                        : STATIC_GOOD_IMAGE,
                                type: 'Image',
                                format: 'image/png',
                                width: CONTINUOUS_PAGE.width,
                                height: CONTINUOUS_PAGE.height,
                            },
                            target: `/demo-manifests/static-many/canvas/${index}`,
                        },
                    ],
                },
            ],
        }));

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                '@context': 'http://iiif.io/api/presentation/3/context.json',
                id: STATIC_MANY_MANIFEST,
                type: 'Manifest',
                label: { en: ['Static-image failure fixture'] },
                items,
            }),
        });
    });

    const counter = { requests: 0 };
    await page.route(`**${STATIC_BROKEN_IMAGE}`, async (route) => {
        counter.requests += 1;
        await route.fulfill({
            status: 404,
            contentType: 'text/plain',
            body: '',
        });
    });
    return counter;
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
 * Give one folio of the continuous fixture a **public declared thumbnail**, so its
 * image service can be gated while its thumbnail is not.
 *
 * This is the ordinary shape of a login-gated manuscript, not a contrivance: a
 * publisher advertises a small open image beside a restricted service. It is
 * injected by rewriting the fixture's own manifest rather than by changing the
 * fixture, so no other spec's canvases acquire a thumbnail they did not have.
 */
async function declarePublicThumbnail(page: Page, index: number) {
    await page.route(`**${CONTINUOUS_MANIFEST}`, async (route) => {
        const response = await route.fetch();
        const manifest = (await response.json()) as {
            items: Array<Record<string, unknown>>;
        };
        manifest.items[index].thumbnail = [
            {
                id: STATIC_GOOD_IMAGE,
                type: 'Image',
                format: 'image/png',
            },
        ];
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(manifest),
        });
    });
}

test.describe('Canvas2D renderer — per-canvas tile-source errors', () => {
    test('one 401 folio out of 800 fails alone, and shows a placeholder in its own rect', async ({
        page,
    }) => {
        const asks = await failFolio(page, 400, 401);
        await open(page);
        await frameFolio(page, 400);

        // The source of truth: exactly one canvas failed, it is folio 400, and
        // the reason is one a reader can act on.
        await expect
            .poll(() => getCanvasErrors(page), { timeout: OPEN_TIMEOUT })
            .toEqual({ [folio(page, 400)]: 'auth' });

        const placeholder = page.locator(PLACEHOLDER);
        await expect(placeholder).toHaveCount(1);
        await expect(placeholder).toHaveAttribute(
            'data-canvas-id',
            folio(page, 400),
        );
        await expect(placeholder).toHaveAttribute('data-error-kind', 'auth');

        // In its LAYOUT RECT, not merely somewhere on the surface. At this
        // framing the viewport is exactly folio 400's own span, so the
        // placeholder must be as wide as the surface.
        const view = await getView(page);
        const box = await placeholder.boundingBox();
        expect(box).not.toBeNull();
        expect(Math.abs(box!.width - view.width)).toBeLessThanOrEqual(2);
        expect(
            Math.abs(
                box!.height -
                    CONTINUOUS_PAGE.height *
                        (view.width / CONTINUOUS_PAGE.width),
            ),
        ).toBeLessThanOrEqual(2);

        // The renderer is still mounted and still painting: the viewer-level
        // error cover would have replaced it outright.
        await expect(page.locator(SURFACE)).toBeVisible();
        await expect(page.locator('[role="alert"]')).toHaveCount(0);

        expect(asks.requests).toBeGreaterThan(0);
    });

    test('the 799 other folios keep working while folio 400 is failed', async ({
        page,
    }) => {
        await failFolio(page, 400, 401);
        await open(page);

        // Folio 400's neighbours are in the pyramid tier beside it — the ±1
        // rule is untouched by the failure, so turning the page onto a working
        // folio is as instant as it ever was.
        await frameFolio(page, 400);
        expect((await getResidency(page)).pyramid.sort()).toEqual(
            [folio(page, 399), folio(page, 400), folio(page, 401)].sort(),
        );

        // And folio 399 genuinely paints: the grid is found by colour, so this
        // can only have come from a decoded image.
        await frameFolio(page, 399);
        await expect
            .poll(
                async () => {
                    const found = await findFeature(page, 'bravo');
                    if (!found) await nextPaint(page);
                    return found;
                },
                { timeout: OPEN_TIMEOUT },
            )
            .not.toBeNull();

        // Only folio 400 ever failed.
        expect(Object.keys(await getCanvasErrors(page))).toEqual([
            folio(page, 400),
        ]);
    });

    /*
     * A 404 is not a 401, and the difference is the whole of user story 27: one
     * of them is fixed by logging in and the other never will be.
     */
    test('a 404 folio is distinguishable from a 401 one', async ({ page }) => {
        await failFolio(page, 400, 404);
        await open(page);
        await frameFolio(page, 400);

        await expect
            .poll(() => getCanvasErrors(page), { timeout: OPEN_TIMEOUT })
            .toEqual({ [folio(page, 400)]: 'load' });

        await expect(page.locator(PLACEHOLDER)).toHaveAttribute(
            'data-error-kind',
            'load',
        );
        await expect(page.locator(SURFACE)).toBeVisible();
    });

    test('the placeholder has an accessible name describing the failure', async ({
        page,
    }) => {
        await failFolio(page, 400, 401);
        await open(page);
        await frameFolio(page, 400);

        await expect(page.locator(PLACEHOLDER)).toHaveCount(1);

        // By ROLE and NAME, which is what an assistive technology has to go on.
        // Painted text would satisfy neither: anything a user must perceive
        // lives in the DOM layer.
        await expect(
            page.getByRole('img', { name: /authentication/i }),
        ).toBeVisible();
    });

    /*
     * The metadata cache's lifetime, made observable. A `401` is an ANSWER about
     * the service, so it is permanent — and the cache is separate from the
     * decoded pixels precisely so that re-entering a canvas costs no request.
     * Without that, scrolling back and forth over a failed folio is an
     * unbounded request loop against an endpoint that already said no.
     */
    test('a failed folio that leaves and re-enters the viewport is not asked again', async ({
        page,
    }) => {
        const asks = await failFolio(page, 400, 401);
        await open(page);

        await frameFolio(page, 400);
        await expect
            .poll(() => getCanvasErrors(page), { timeout: OPEN_TIMEOUT })
            .toEqual({ [folio(page, 400)]: 'auth' });
        const afterFirstVisit = asks.requests;
        expect(afterFirstVisit).toBe(1);

        // Far enough away that folio 400 is outside the residency window
        // entirely, then back.
        await frameFolio(page, 700);
        await nextPaint(page);
        await frameFolio(page, 400);
        await nextPaint(page);
        await page.waitForTimeout(500);

        expect(asks.requests).toBe(afterFirstVisit);
        // Still failed, from the cache rather than from a second answer.
        expect(await getCanvasErrors(page)).toEqual({
            [folio(page, 400)]: 'auth',
        });
    });

    /*
     * The other half of the model: when there is nothing left to look at, the
     * viewer-level condition IS the honest one, and the existing chrome is
     * what says so.
     */
    test('viewing a failed canvas on its own surfaces the viewer-level error UI', async ({
        page,
    }) => {
        await page.route('**/iiif-fixture/one/info.json', async (route) => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'injected' }),
            });
        });

        // Not `openRendererManifest`: nothing will ever paint, which is the
        // point, so there is no feature to wait for.
        const config = encodeURIComponent(
            JSON.stringify({ viewingMode: 'individuals' }),
        );
        await page.goto(
            `/e2e/harness.html?manifest=${TILED_MANIFEST}&config=${config}`,
            {
                waitUntil: 'domcontentloaded',
            },
        );

        const alert = page.locator('[role="alert"]');
        await expect(alert).toBeVisible({ timeout: OPEN_TIMEOUT });
        // The auth message, not the generic load one: the distinction survives
        // all the way to the chrome.
        await expect(alert).toContainText(/authentication/i);

        // The cover replaces the renderer, which is exactly why
        // `viewerLevelErrorKind` refuses to raise this while a sibling canvas
        // still works.
        await expect(page.locator(SURFACE)).toHaveCount(0);
    });

    /*
     * The zoom ceiling is 128x home, so a failed canvas whose rect is many times
     * the viewport is ordinary. Then its border is off screen on every side and a
     * label centred in the RECT is centred on a point nobody can see: the
     * accessible name goes on being correct while a sighted reader is left with a
     * flat fill and no message. Only a browser can state this — it is a claim
     * about where a real element landed.
     */
    test('the message stays on screen when the failed folio is zoomed past the viewport', async ({
        page,
    }) => {
        await failFolio(page, 400, 401);
        await open(page);
        await frameFolio(page, 400);

        await expect(page.locator(PLACEHOLDER)).toHaveCount(1);

        // Four times the framing that fits the folio: the rect is now four
        // viewports across and its centre is well outside the surface.
        const view = await getView(page);
        await setView(page, {
            centre: {
                x: 400 * PITCH + CONTINUOUS_PAGE.width / 2,
                y: CONTINUOUS_PAGE.height / 2,
            },
            scale: (view.width / CONTINUOUS_PAGE.width) * 4,
        });
        await nextPaint(page);

        const surface = await page.locator(SURFACE).boundingBox();
        const rect = await page.locator(PLACEHOLDER).boundingBox();
        expect(surface).not.toBeNull();
        expect(rect).not.toBeNull();
        // The rect really does overflow the viewport — otherwise this journey is
        // asserting nothing.
        expect(rect!.width).toBeGreaterThan(surface!.width * 2);

        const label = page.locator(LABEL);
        await expect(label).toBeVisible();
        await expect(label).toContainText(/authentication/i);

        const box = await label.boundingBox();
        expect(box).not.toBeNull();
        // Wholly inside the surface, on all four sides.
        expect(box!.x).toBeGreaterThanOrEqual(surface!.x - 1);
        expect(box!.y).toBeGreaterThanOrEqual(surface!.y - 1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(
            surface!.x + surface!.width + 1,
        );
        expect(box!.y + box!.height).toBeLessThanOrEqual(
            surface!.y + surface!.height + 1,
        );
    });

    /*
     * A failure is about the SOURCE WE ASKED, not about the canvas. A manifest very
     * commonly advertises a public `thumbnail` beside a login-gated image service,
     * and a declared thumbnail resolves with no `info.json` at all — so a reader who
     * views such a folio full-page records an `auth` failure against it, zooms out,
     * and its thumbnail then paints perfectly well. An opaque placeholder over it
     * would cover the only pixels that folio ever had.
     */
    test('a failed folio whose public thumbnail paints shows no placeholder over it', async ({
        page,
    }) => {
        await failFolio(page, 400, 401);
        await declarePublicThumbnail(page, 400);
        await open(page);

        // Full page: the pyramid tier, whose only source is the gated service.
        await frameFolio(page, 400);
        await expect
            .poll(() => getCanvasErrors(page), { timeout: OPEN_TIMEOUT })
            .toEqual({ [folio(page, 400)]: 'auth' });
        await expect(page.locator(PLACEHOLDER)).toHaveCount(1);

        // Zoomed out to the thumbnail tier, where the declared thumbnail is what
        // paints. `pyramidThreshold` is 320 CSS px of projected extent, so a
        // 1200-unit folio is below it under ~0.27.
        const view = await getView(page);
        await setView(page, {
            centre: {
                x: 400 * PITCH + CONTINUOUS_PAGE.width / 2,
                y: CONTINUOUS_PAGE.height / 2,
            },
            scale: 0.2,
        });
        await nextPaint(page);

        // The tier really is thumbnail — not box, which would explain an absent
        // placeholder for the wrong reason.
        await expect
            .poll(async () => (await getResidency(page)).thumbnail, {
                timeout: OPEN_TIMEOUT,
            })
            .toContain(folio(page, 400));

        // The placeholder goes as soon as the thumbnail is decoded and drawn, and
        // the failure is still recorded: the source of truth is unchanged, only
        // what the reader is shown about it.
        await expect(page.locator(PLACEHOLDER)).toHaveCount(0, {
            timeout: OPEN_TIMEOUT,
        });
        expect(await getCanvasErrors(page)).toEqual({
            [folio(page, 400)]: 'auth',
        });

        // …and back to full page, where there is nothing to paint again.
        await setView(page, {
            centre: {
                x: 400 * PITCH + CONTINUOUS_PAGE.width / 2,
                y: CONTINUOUS_PAGE.height / 2,
            },
            scale: view.width / CONTINUOUS_PAGE.width,
        });
        await nextPaint(page);
        await expect(page.locator(PLACEHOLDER)).toHaveCount(1, {
            timeout: OPEN_TIMEOUT,
        });
    });

    /*
     * The static-image half of the model, and specifically the eviction clause —
     * the one place where "a canvas that failed is not refetched every time it
     * re-enters the viewport" is NOT free. A service-backed canvas gets it from
     * the module-scoped metadata cache; a static one has no `info.json`, fails in
     * an `<img>` `onerror`, and had only component state to remember it in — state
     * the residency reconciliation clears along with the pixels when the canvas
     * leaves the window. Without the URL-keyed negative cache
     * (`renderer/staticImageFailures.ts`) every scroll back over folio 5 is a
     * fresh 404 and a flickering placeholder.
     */
    test('a static image that 404s fails alone, and is requested exactly once across a round trip', async ({
        page,
    }) => {
        const asks = await routeStaticManifest(page);
        await openRendererManifest(
            page,
            STATIC_MANY_MANIFEST,
            { viewingMode: 'continuous' },
            OPEN_TIMEOUT,
        );

        await frameFolio(page, STATIC_BROKEN_FOLIO);

        // An `<img>` reports no status, so a static source's failure can only ever
        // be `load` — there is no 401 for it to be.
        await expect
            .poll(() => getCanvasErrors(page), { timeout: OPEN_TIMEOUT })
            .toEqual({ [staticFolio(STATIC_BROKEN_FOLIO)]: 'load' });

        const placeholder = page.locator(PLACEHOLDER);
        await expect(placeholder).toHaveCount(1);
        await expect(placeholder).toHaveAttribute(
            'data-canvas-id',
            staticFolio(STATIC_BROKEN_FOLIO),
        );
        await expect(placeholder).toHaveAttribute('data-error-kind', 'load');
        // The renderer is still mounted: one bad page does not blank the viewer.
        await expect(page.locator(SURFACE)).toBeVisible();

        const afterFirstVisit = asks.requests;
        expect(afterFirstVisit).toBe(1);

        // Its neighbour paints, from the same image URL the broken folio was the
        // one exception to.
        await frameFolio(page, STATIC_BROKEN_FOLIO + 1);
        await expect
            .poll(
                async () => {
                    const found = await findFeature(page, 'bravo');
                    if (!found) await nextPaint(page);
                    return found;
                },
                { timeout: OPEN_TIMEOUT },
            )
            .not.toBeNull();

        // Far enough that folio 5 is out of the residency window entirely — which
        // for a static canvas releases its URL and its recorded error with its
        // pixels — and then back.
        await frameFolio(page, 30);
        await expect
            .poll(() => getCanvasErrors(page), { timeout: OPEN_TIMEOUT })
            .toEqual({});

        await frameFolio(page, STATIC_BROKEN_FOLIO);
        await nextPaint(page);
        await page.waitForTimeout(500);

        // ONE request, for the whole round trip. This is the assertion the
        // eviction clause reduces to.
        expect(asks.requests).toBe(afterFirstVisit);
        // And the placeholder is back, re-derived from the negative cache rather
        // than from a second answer.
        expect(await getCanvasErrors(page)).toEqual({
            [staticFolio(STATIC_BROKEN_FOLIO)]: 'load',
        });
        await expect(page.locator(PLACEHOLDER)).toHaveCount(1);
    });
});
