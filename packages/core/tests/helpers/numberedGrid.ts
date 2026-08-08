/**
 * The geometric assertion harness — the epic's hard correctness gate (spec
 * §Testing Decisions, "Geometric assertions").
 *
 * It answers one question: **did the pixels land where the coordinate model
 * says they should?** A named feature of the numbered-grid fixture is located
 * by reading the rendered canvas back, and its centroid is compared with the
 * screen coordinate the viewport transform predicts — within one pixel.
 *
 * This is deliberately not a screenshot comparison. Canvas2D resampling differs
 * at essentially every pixel between engines and zoom levels, so a screenshot
 * diff either fails everywhere or has its tolerance ratcheted until it asserts
 * nothing. A centroid of exactly-coloured pixels is immune to resampling: the
 * blend zone at a solid marker's edge is symmetric, so it shrinks the matched
 * set without moving its centre.
 *
 * See `scripts/generate-grid-image.mjs` for the fixture and why it is shaped
 * this way.
 */

import { expect, type Page } from '@playwright/test';

export const GRID_MANIFEST = '/demo-manifests/static-image/manifest.json';

/**
 * The same numbered grid, delivered through a IIIF Image API level 2 service
 * with a real tile pyramid (see `scripts/iiifFixturePlugin.mjs`).
 *
 * Deliberately the same picture as the static fixture, so every geometric
 * expectation written for ticket 04 carries over to deep zoom unchanged — a
 * tile-seam or level-selection regression shows up as a feature landing in the
 * wrong place, not as a new set of numbers to maintain.
 */
export const TILED_MANIFEST = '/demo-manifests/tiled/manifest.json';
/** The image services the tiled fixture's two canvases are backed by. */
export const TILED_SERVICES = ['/iiif-fixture/one', '/iiif-fixture/two'];

/** Canvas-space (== image-space, for this fixture) coordinates of each feature. */
export const GRID_FEATURES = {
    alpha: { x: 200, y: 150, color: [230, 0, 0] },
    bravo: { x: 600, y: 450, color: [0, 170, 0] },
    charlie: { x: 1000, y: 750, color: [0, 0, 220] },
    delta: { x: 200, y: 750, color: [220, 0, 220] },
    echo: { x: 1000, y: 150, color: [0, 180, 190] },
} as const;

export type GridFeatureName = keyof typeof GRID_FEATURES;

export interface RendererView {
    centre: { x: number; y: number };
    scale: number;
    width: number;
    height: number;
    dpr: number;
}

const SURFACE = '[data-testid="canvas-renderer-surface"]';

/**
 * Select the first-party Canvas2D renderer for this page.
 *
 * The development-only flag is left undefined on the dev server, which makes it
 * an ordinary mutable global — so a spec can select the new renderer per test
 * while the rest of the suite keeps exercising the OpenSeadragon path in the
 * same run. This must run before any page script, hence `addInitScript`.
 */
export async function useCanvasRenderer(page: Page): Promise<void> {
    await page.addInitScript(() => {
        (
            globalThis as { __TRIIICERATOPS_CANVAS_RENDERER__?: boolean }
        ).__TRIIICERATOPS_CANVAS_RENDERER__ = true;
    });
}

/** Open the numbered-grid fixture with the Canvas2D renderer selected. */
export async function openGridManifest(page: Page): Promise<void> {
    await useCanvasRenderer(page);
    await page.goto(`/?manifest=${GRID_MANIFEST}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 20_000 });
    // Wait for the image to decode and land: until a feature is findable, the
    // canvas is painted but empty and every assertion below would be vacuous.
    await expect
        .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
        .not.toBeNull();
}

/**
 * Open the tiled fixture with the Canvas2D renderer selected.
 *
 * Waits for a feature to be findable, which for a tiled canvas means the base
 * level has been fetched, decoded, and painted — the whole `info.json` →
 * pyramid → schedule → decode → paint path.
 */
export async function openTiledManifest(page: Page): Promise<void> {
    await useCanvasRenderer(page);
    await page.goto(`/?manifest=${TILED_MANIFEST}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 20_000 });
    await expect
        .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
        .not.toBeNull();
}

/** The renderer's residency counters. */
export interface RendererStats {
    residentTileCount: number;
    decodedBytes: number;
    tileRequestCount: number;
    /**
     * Full scene plans built. A plan enumerates the required tile set, so this
     * is what makes "planning is once per frame, never once per pointer event"
     * an assertable claim rather than a comment.
     */
    scenePlanCount: number;
}

export async function getStats(page: Page): Promise<RendererStats> {
    return page.locator(SURFACE).evaluate((element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: { getStats(): RendererStats };
            }
        ).__triiiceratopsRenderer;
        if (!handle) throw new Error('renderer test handle not installed');
        return handle.getStats();
    }) as Promise<RendererStats>;
}

export async function getView(page: Page): Promise<RendererView> {
    return page.locator(SURFACE).evaluate((element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: { getView(): RendererView };
            }
        ).__triiiceratopsRenderer;
        if (!handle) throw new Error('renderer test handle not installed');
        return handle.getView();
    }) as Promise<RendererView>;
}

/**
 * Put the viewport in an exact, known state and wait for the frame that paints
 * it.
 *
 * Reaching a zoom level by synthesizing wheel events would make the assertion
 * depend on the animation's settling, which is a different property tested
 * separately. Ticket 13 replaces this handle with real viewport command state.
 */
export async function setView(
    page: Page,
    view: { centre: { x: number; y: number }; scale: number },
): Promise<void> {
    await page.locator(SURFACE).evaluate((element, next) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: {
                    setView(v: typeof next): Promise<void>;
                };
            }
        ).__triiiceratopsRenderer;
        if (!handle) throw new Error('renderer test handle not installed');
        return handle.setView(next);
    }, view);
}

/** Wait for the next painted frame. */
export async function nextPaint(page: Page): Promise<void> {
    await page.locator(SURFACE).evaluate((element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: { nextPaint(): Promise<void> };
            }
        ).__triiiceratopsRenderer;
        if (!handle) throw new Error('renderer test handle not installed');
        return handle.nextPaint();
    });
}

/**
 * Where a named feature actually is on screen, in CSS pixels relative to the
 * canvas element — or `null` if none of its pixels are on screen.
 */
export async function findFeature(
    page: Page,
    name: GridFeatureName,
): Promise<{ x: number; y: number } | null> {
    const color = GRID_FEATURES[name].color;

    return page.locator(SURFACE).evaluate(
        (element, target: readonly number[]) => {
            const canvas = element as HTMLCanvasElement;
            const ctx = canvas.getContext('2d');
            if (!ctx || canvas.width === 0 || canvas.height === 0) return null;

            const { data } = ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
            );

            // A generous per-channel tolerance: the marker colours are far
            // apart from each other and from the grid, so nothing else can
            // match, while resampled interior pixels drift by a few units.
            const TOLERANCE = 40;
            let sumX = 0;
            let sumY = 0;
            let count = 0;

            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 200) continue;
                if (
                    Math.abs(data[i] - target[0]) > TOLERANCE ||
                    Math.abs(data[i + 1] - target[1]) > TOLERANCE ||
                    Math.abs(data[i + 2] - target[2]) > TOLERANCE
                ) {
                    continue;
                }
                const pixel = i / 4;
                // +0.5 addresses the pixel's CENTRE, so the centroid of a block
                // of pixels is its true geometric centre rather than a
                // half-pixel short of it.
                sumX += (pixel % canvas.width) + 0.5;
                sumY += Math.floor(pixel / canvas.width) + 0.5;
                count += 1;
            }

            if (count === 0) return null;

            // The backing store is in device pixels; report CSS pixels.
            const scaleX = canvas.width / canvas.clientWidth;
            const scaleY = canvas.height / canvas.clientHeight;

            return { x: sumX / count / scaleX, y: sumY / count / scaleY };
        },
        color as readonly number[],
    );
}

/**
 * The screen coordinate the coordinate model predicts for a canvas-space point.
 *
 * Written out here rather than imported from the renderer: the assertion is
 * that the painted pixels agree with the documented model, so the model side of
 * the comparison must be stated independently.
 */
export function predictScreenPoint(
    point: { x: number; y: number },
    view: RendererView,
): { x: number; y: number } {
    return {
        x: (point.x - view.centre.x) * view.scale + view.width / 2,
        y: (point.y - view.centre.y) * view.scale + view.height / 2,
    };
}

/** Assert a named feature landed within `tolerance` CSS pixels of its prediction. */
export async function expectFeatureOnModel(
    page: Page,
    name: GridFeatureName,
    tolerance = 1,
): Promise<void> {
    const view = await getView(page);
    const expected = predictScreenPoint(GRID_FEATURES[name], view);
    const actual = await findFeature(page, name);

    expect(
        actual,
        `feature "${name}" was not visible on the canvas`,
    ).not.toBeNull();
    expect(
        Math.abs(actual!.x - expected.x),
        `feature "${name}" x: expected ${expected.x}, got ${actual!.x}`,
    ).toBeLessThanOrEqual(tolerance);
    expect(
        Math.abs(actual!.y - expected.y),
        `feature "${name}" y: expected ${expected.y}, got ${actual!.y}`,
    ).toBeLessThanOrEqual(tolerance);
}
