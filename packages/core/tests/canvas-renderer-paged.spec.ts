/**
 * Seam 2 — multi-canvas layout in a real browser (spec §Testing Decisions).
 *
 * The planner's positions are asserted exhaustively in Node
 * (`renderer/planScene.test.ts`); what only a browser can answer is whether the
 * pixels landed where those positions say. So these specs are geometric
 * assertions, exactly like the single-canvas ones: a named feature of the
 * numbered grid must appear within a pixel of where the coordinate model
 * predicts — this time on the SECOND page of a spread, whose world position is
 * the first page's width plus the inter-canvas gap.
 *
 * The prediction is written out from the fixture's own dimensions and the
 * renderer's gap budget rather than read back from the renderer, so a layout
 * that moved both the pixels and its own answer would still fail.
 */

import { expect, test, type Page } from '@playwright/test';

import {
    expectFeatureOnModel,
    findFeature,
    getView,
    GRID_FEATURES,
    openRendererManifest,
    PAGED_MANIFEST,
    predictScreenPoint,
    setView,
} from './helpers/numberedGrid';
import { MULTI_CANVAS_GAP_FRACTION } from '../src/lib/renderer/rendererDefaults';

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

/** Both fixture canvases, in canvas space. */
const PAGE = { width: 1200, height: 900 };

/**
 * Where the second page starts, in world units.
 *
 * Stated here rather than queried: the gap is a fraction of the median laid-out
 * canvas extent along the flow axis, and every canvas in this fixture is the same
 * width, so the median IS the page width. Normalization is the identity for the
 * same reason, which is why no scale factor appears.
 */
const VERSO_X = PAGE.width + MULTI_CANVAS_GAP_FRACTION * PAGE.width;

/**
 * Open the spread.
 *
 * `pagedViewOffset: false` pairs from the first canvas. The default pairs from
 * the second — page one alone, as a book's cover — which would put a single
 * canvas on screen and there would be no spread to measure.
 */
async function openSpread(page: Page) {
    await openRendererManifest(page, PAGED_MANIFEST, {
        viewingMode: 'paged',
        pagedViewOffset: false,
    });
}

/**
 * Frame exactly one page, and return where the model says its centre feature
 * lands.
 *
 * The scale is chosen so the viewport is narrower than a page: with the other
 * page off screen, a feature found by colour can only have come from this one.
 */
async function frameOnly(page: Page, pageOriginX: number) {
    const view = await getView(page);
    const centre = {
        x: pageOriginX + GRID_FEATURES.bravo.x,
        y: GRID_FEATURES.bravo.y,
    };
    // A viewport 1000 world units wide, inside a 1200-unit page.
    await setView(page, { centre, scale: view.width / 1000 });
    return centre;
}

test.describe('Canvas2D renderer — paged spreads', () => {
    test('paints the second page of a spread a page-width plus a gap along', async ({
        page,
    }) => {
        await openSpread(page);

        const centre = await frameOnly(page, VERSO_X);
        const view = await getView(page);
        const expected = predictScreenPoint(centre, view);
        const actual = await findFeature(page, 'bravo');

        expect(
            actual,
            'the second page of the spread painted nothing in the viewport',
        ).not.toBeNull();
        expect(Math.abs(actual!.x - expected.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(actual!.y - expected.y)).toBeLessThanOrEqual(1);
    });

    test('leaves the first page of a spread at the world origin', async ({
        page,
    }) => {
        // Canvas space and world space still coincide for the first canvas,
        // which is what every single-canvas geometric assertion in this suite
        // depends on.
        await openSpread(page);

        await frameOnly(page, 0);
        await expectFeatureOnModel(page, 'bravo');
    });

    test('separates the two pages by the gap rather than butting them together', async ({
        page,
    }) => {
        // The gap is small — 1.25% of a page — so it is asserted as a
        // difference rather than trusted to show up in a ±1px check: framed on
        // where a GAPLESS layout would have put the verso, the feature must be
        // off by exactly the gap.
        await openSpread(page);

        await frameOnly(page, PAGE.width);
        const view = await getView(page);
        const expected = predictScreenPoint(
            { x: PAGE.width + GRID_FEATURES.bravo.x, y: GRID_FEATURES.bravo.y },
            view,
        );
        const actual = await findFeature(page, 'bravo');

        const gapPixels = MULTI_CANVAS_GAP_FRACTION * PAGE.width * view.scale;

        expect(actual).not.toBeNull();
        expect(
            Math.abs(actual!.x - expected.x - gapPixels),
            `the verso is ${actual!.x - expected.x} px from a gapless layout, not ${gapPixels}`,
        ).toBeLessThanOrEqual(1);
    });
});
