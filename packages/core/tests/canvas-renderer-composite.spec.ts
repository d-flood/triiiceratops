/**
 * **Composite canvases** — a canvas is a composition of placed images, not one
 * image (IIIF Cookbook recipe 0036).
 *
 * Two regressions are pinned here, and they are one missing concept:
 *
 * 1. **Only the first painting annotation was painted.** The renderer resolved a
 *    canvas through the singular `resolveCanvasImage`, which is
 *    `resolveAllCanvasImages()[0]`, so 0036's miniature was never requested at
 *    all — its image service was never touched. Answerable from the network,
 *    which is why the fixture's two halves are DISTINCT services.
 * 2. **The `#xywh` target placement was discarded.** Every image was drawn
 *    across the whole canvas, so even a single region-targeted canvas was wrong
 *    (user story 30) and a composite one had its second image laid over its
 *    first. Answerable from pixels, which is what the geometric harness is for.
 *
 * The fixture is one 1200x1800 canvas whose two annotations target its top and
 * bottom halves, each painting a whole numbered grid (see
 * `helpers/numberedGrid.COMPOSITE_MANIFEST`). They do not overlap, so framing
 * one half puts exactly one grid in the viewport — and "exactly one" is itself
 * the assertion that the second image landed in its own box rather than on top
 * of the first.
 *
 * Chromium only, like every other renderer geometry spec: this is coordinate
 * maths and network behaviour, and widening the matrix would buy noise rather
 * than coverage.
 */

import { expect, test, type Page, type Request } from '@playwright/test';

import {
    COMPOSITE_MANIFEST,
    COMPOSITE_OVERLAP_MANIFEST,
    COMPOSITE_REGIONS,
    compositeFeaturePoint,
    compositeInsetFeaturePoint,
    findFeature,
    getView,
    nextPaint,
    openRendererManifest,
    predictScreenPoint,
    setView,
    type GridFeatureName,
} from './helpers/numberedGrid';

const TILE_PATTERN = /\/iiif-fixture\/[^/]+\/[^/]+\/[^/]+\/0\/[^/]+\.png$/;
const INFO_PATTERN = /\/iiif-fixture\/[^/]+\/info\.json$/;

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'The composite renderer slice is Chromium-only.',
);

function recordRequests(page: Page, pattern: RegExp): string[] {
    const urls: string[] = [];
    page.on('request', (request: Request) => {
        if (pattern.test(request.url())) urls.push(request.url());
    });
    return urls;
}

/** Frame one of the two regions, filling the viewport with just that grid. */
async function frameRegion(
    page: Page,
    region: keyof typeof COMPOSITE_REGIONS,
): Promise<void> {
    const box = COMPOSITE_REGIONS[region];
    const view = await getView(page);

    await setView(page, {
        centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        // Comfortably inside the half, so the neighbouring grid is off screen
        // and cannot contribute pixels to a colour match.
        scale: Math.min(view.width / box.width, view.height / box.height) * 0.9,
    });
    await nextPaint(page);
}

/**
 * Assert a grid feature landed where the coordinate model says, given which of
 * the two placements it belongs to.
 *
 * The prediction goes through `compositeFeaturePoint`, which is the manifest's
 * own arithmetic — grid coordinate into target box — rather than the renderer's.
 */
async function expectFeatureInRegion(
    page: Page,
    name: GridFeatureName,
    region: keyof typeof COMPOSITE_REGIONS,
): Promise<void> {
    const view = await getView(page);
    const expected = predictScreenPoint(
        compositeFeaturePoint(name, region),
        view,
    );
    const actual = await findFeature(page, name);

    expect(actual, `feature "${name}" was not visible`).not.toBeNull();
    expect(
        Math.abs(actual!.x - expected.x),
        `feature "${name}" x: expected ${expected.x}, got ${actual!.x}`,
    ).toBeLessThanOrEqual(1);
    expect(
        Math.abs(actual!.y - expected.y),
        `feature "${name}" y: expected ${expected.y}, got ${actual!.y}`,
    ).toBeLessThanOrEqual(1);
}

test.describe('Canvas2D renderer — composite canvases', () => {
    test('requests both painting annotations, not only the first', async ({
        page,
    }) => {
        const tiles = recordRequests(page, TILE_PATTERN);
        const infos = recordRequests(page, INFO_PATTERN);

        await openRendererManifest(page, COMPOSITE_MANIFEST);
        await nextPaint(page);

        const asked = (urls: string[], service: string) =>
            urls.filter((url) => url.includes(`/iiif-fixture/${service}/`));

        // The regression, stated plainly: before this, `composite-lower` was
        // never requested — no `info.json`, no tiles, nothing — because the
        // renderer resolved only the first painting annotation.
        for (const service of ['composite-upper', 'composite-lower']) {
            await expect
                .poll(() => asked(infos, service).length, { timeout: 20_000 })
                .toBe(1);
            await expect
                .poll(() => asked(tiles, service).length, { timeout: 20_000 })
                .toBeGreaterThan(0);
        }
    });

    test('paints each annotation into its own #xywh box', async ({ page }) => {
        await openRendererManifest(page, COMPOSITE_MANIFEST);

        // The upper grid, framed alone. Its target is `#xywh=0,0,1200,900`, so
        // its features are at their grid coordinates in canvas space.
        await frameRegion(page, 'upper');
        for (const name of ['alpha', 'bravo', 'charlie'] as const) {
            await expectFeatureInRegion(page, name, 'upper');
        }

        // The lower grid, framed alone. Its target is `#xywh=0,900,1200,900`,
        // so every feature is 900 canvas units further down — which is the
        // whole of what the discarded placement got wrong.
        await frameRegion(page, 'lower');
        for (const name of ['alpha', 'bravo', 'charlie'] as const) {
            await expectFeatureInRegion(page, name, 'lower');
        }
    });

    /**
     * **Paint order is annotation order — and it survives zooming in.**
     *
     * The side-by-side fixture above is blind to this: its two images never
     * overlap, so nothing can paint over anything. Here the inset sits ON the
     * full-canvas image, and because it is a third the size it settles on a
     * coarser pyramid level — so a draw list sorted globally by level puts every
     * finer tile of the image BENEATH after it, and the inset disappears.
     *
     * It disappears only when zoomed IN, which is what makes it so easy to miss:
     * at the thumbnail tier both pictures sit at rungs 0 and 1 and the order
     * survives by luck.
     */
    test('keeps a smaller inset image on top as the reader zooms in', async ({
        page,
    }) => {
        await openRendererManifest(page, COMPOSITE_OVERLAP_MANIFEST);

        // Framed on the inset's own copy of `alpha`, tightly enough that the
        // BASE image's copy of it — at canvas (200,150) — is off screen and
        // cannot contribute to the colour match.
        const target = compositeInsetFeaturePoint('alpha');
        await setView(page, { centre: target, scale: 2 });
        await nextPaint(page);

        // The inset maps the whole grid into a 400x300 box, so this point shows
        // a red marker if and only if the inset painted over the image beneath
        // it. The base image has only background here.
        await expect
            .poll(() => findFeature(page, 'alpha'), { timeout: 20_000 })
            .not.toBeNull();

        const view = await getView(page);
        const expected = predictScreenPoint(target, view);
        const actual = await findFeature(page, 'alpha');

        expect(Math.abs(actual!.x - expected.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(actual!.y - expected.y)).toBeLessThanOrEqual(1);
    });

    test('keeps the two images apart rather than stacking them', async ({
        page,
    }) => {
        await openRendererManifest(page, COMPOSITE_MANIFEST);
        await frameRegion(page, 'upper');

        // Framed on the upper half, the LOWER half's copy of a feature is off
        // screen. Painted across the whole canvas — the pre-fix behaviour —
        // both copies would be in this viewport and the colour match would
        // return the centroid of two blobs, landing between them.
        const view = await getView(page);
        const upper = predictScreenPoint(
            compositeFeaturePoint('bravo', 'upper'),
            view,
        );
        const found = await findFeature(page, 'bravo');

        expect(found).not.toBeNull();
        expect(Math.abs(found!.x - upper.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(found!.y - upper.y)).toBeLessThanOrEqual(1);

        // And the feature is genuinely inside the upper half's screen box, not
        // merely near a prediction that happens to agree.
        const lowerTop = predictScreenPoint(
            { x: 0, y: COMPOSITE_REGIONS.lower.y },
            view,
        );
        expect(found!.y).toBeLessThan(lowerTop.y);
    });
});
