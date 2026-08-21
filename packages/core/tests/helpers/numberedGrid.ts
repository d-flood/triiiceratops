/**
 * The geometric assertion harness (spec §Testing Decisions, "Geometric
 * assertions").
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
 * expectation carries over to deep zoom unchanged — a
 * tile-seam or level-selection regression shows up as a feature landing in the
 * wrong place, not as a new set of numbers to maintain.
 */
export const TILED_MANIFEST = '/demo-manifests/tiled/manifest.json';

/**
 * The same grid again, through a **strict Image API 2.1** service that rejects
 * any quality but `default` (see `scripts/iiifFixturePlugin.mjs`).
 *
 * The one browser fixture whose tile URLs are not built from a version 3
 * document. `native` was deprecated in 2.1 and a 2.0 document is
 * indistinguishable from a 2.1 one, so a renderer that infers `native` from
 * "version 2" blanks this canvas permanently — and every real 2.1 endpoint with
 * it.
 */
export const TILED_V2_MANIFEST = '/demo-manifests/tiled-v2/manifest.json';

/**
 * The grid through a **level0 service that advertises tiles** — an ordinary
 * pyramid whose levels are restricted to the advertised scale factors.
 *
 * The fixture service answers 404 for any other factor, so a level chosen
 * outside the advertised set is a blank canvas rather than a subtle difference.
 */
export const LEVEL0_TILED_MANIFEST =
    '/demo-manifests/level0-tiled/manifest.json';

/**
 * The grid through a **size-ladder source**: a level0 service advertising only
 * fixed whole-image sizes, with no tiling at all.
 *
 * The fixture service answers 404 for every region but `full` and every size it
 * did not advertise, so a renderer that tries to tile this canvas paints
 * nothing.
 */
export const LEVEL0_SIZES_MANIFEST =
    '/demo-manifests/level0-sizes/manifest.json';

/**
 * The size-ladder source as a **frozen pre-2016 static tree**: an Image API 2
 * level0 service whose files were all generated with the deprecated `native`
 * quality, and which 404s `default`.
 *
 * The renderer asks every version 2 service for `default` — 2.1 requires it and
 * a 2.0 document is indistinguishable from a 2.1 one. For a ladder every rung
 * shares that parameter, so being wrong here is not a blurrier canvas: it is
 * every rung 404ing into the negative cache and a canvas blank for the life of
 * the page. This fixture renders only if the one-request-per-service fallback
 * works.
 */
export const LEVEL0_SIZES_V2_MANIFEST =
    '/demo-manifests/level0-sizes-v2/manifest.json';

/**
 * A **facing-page** manifest: every canvas the same numbered grid at the same
 * Canvas dimensions, so median-height normalization is the identity and the
 * second page's expected position is arithmetic a spec can state.
 *
 * The pages being identical is deliberate. A feature is located by colour, so a
 * spec has to put exactly one page in the viewport to know which page it found
 * — and "only one page is in this viewport" is itself the assertion that the
 * second page is BESIDE the first rather than on top of it, which is the bug
 * this layout fixes.
 */
export const PAGED_MANIFEST = '/demo-manifests/paged/manifest.json';

/**
 * One canvas painted by a v3 **Choice** between two distinct level 2 services,
 * shaped like IIIF Cookbook recipe 0033.
 *
 * Both alternatives are the same numbered grid, so a spec here cannot assert on
 * pixels — and does not need to. The question a Choice raises is *which service
 * the renderer asks for*, and that is answerable from the network: a canvas id
 * is not a stable name for a picture, so a cache keyed on it alone serves the
 * first alternative back forever and issues no request at all for the second.
 */
export const CHOICE_MANIFEST = '/demo-manifests/choice/manifest.json';

/**
 * ONE canvas painted by TWO painting annotations, each targeting its own
 * `#xywh` region — IIIF Cookbook recipe 0036's shape, where a folio is painted
 * by its full scan and a miniature over a rectangle of it.
 *
 * The canvas is 1200x1800 and the regions are its top and bottom halves, so
 * each image maps a whole numbered grid onto a known box and every existing
 * geometric expectation carries over with one offset. They do not overlap,
 * deliberately: a feature is located by colour, so a spec has to put exactly one
 * of them in the viewport to know which it found — and that is itself the
 * assertion that the second image landed in ITS OWN box rather than across the
 * whole canvas on top of the first, which is what discarding the target
 * placement did.
 */
export const COMPOSITE_MANIFEST = '/demo-manifests/composite/manifest.json';

/** The image services the composite fixture's two placements are backed by. */
export const COMPOSITE_SERVICES = [
    '/iiif-fixture/composite-upper',
    '/iiif-fixture/composite-lower',
];

/**
 * The canvas-space box each of the composite fixture's placements paints into.
 *
 * Stated here rather than derived from the manifest, for the same reason
 * {@link predictScreenPoint} restates the coordinate model: the assertion is
 * that the renderer agrees with the manifest, so the manifest's side of it has
 * to be independent of the renderer's reading.
 */
export const COMPOSITE_REGIONS = {
    upper: { x: 0, y: 0, width: 1200, height: 900 },
    lower: { x: 0, y: 900, width: 1200, height: 900 },
} as const;

/**
 * The same canvas, but with the second image painted **on** the first rather
 * than beside it: a full-canvas grid with a third-size grid inset over its
 * middle, which is IIIF Cookbook recipe 0036's real shape.
 *
 * The sibling {@link COMPOSITE_MANIFEST} separates its two images so their
 * PLACEMENT is checkable. This one overlaps them so their PAINT ORDER is — a
 * distinct property, and one the side-by-side fixture is blind to. The inset is
 * small enough to settle on a coarser pyramid level than the image beneath it,
 * which is exactly when a draw list sorted globally by level paints the big
 * image over the small one and the inset vanishes as the reader zooms in.
 */
export const COMPOSITE_OVERLAP_MANIFEST =
    '/demo-manifests/composite-overlap/manifest.json';

/** The inset's target box on that 1200x900 canvas. */
export const COMPOSITE_INSET = { x: 400, y: 300, width: 400, height: 300 };

/**
 * Where a grid feature painted by the INSET lands in canvas space.
 *
 * The inset maps the whole 1200x900 grid into a 400x300 box, so its markers sit
 * where the full-canvas image beneath it has only background — which is what
 * makes "did the inset paint last?" answerable from one coloured pixel.
 */
export function compositeInsetFeaturePoint(name: GridFeatureName): {
    x: number;
    y: number;
} {
    const feature = GRID_FEATURES[name];

    return {
        x: COMPOSITE_INSET.x + (feature.x / 1200) * COMPOSITE_INSET.width,
        y: COMPOSITE_INSET.y + (feature.y / 900) * COMPOSITE_INSET.height,
    };
}

/**
 * Where a grid feature lands in CANVAS space when the grid is painted into one
 * of those boxes.
 *
 * The grid is 1200x900 and each box is 1200x900, so this is a pure translation
 * — which is the point: it keeps the expectation legible while still being the
 * general mapping, so a fixture whose regions were scaled would need no new
 * arithmetic here.
 */
export function compositeFeaturePoint(
    name: GridFeatureName,
    region: keyof typeof COMPOSITE_REGIONS,
): { x: number; y: number } {
    const box = COMPOSITE_REGIONS[region];
    const feature = GRID_FEATURES[name];

    return {
        x: box.x + (feature.x / 1200) * box.width,
        y: box.y + (feature.y / 900) * box.height,
    };
}

/**
 * The **800-canvas continuous fixture**, generated by the dev-server fixture
 * plugin rather than checked in (see `scripts/iiifFixturePlugin.mjs`).
 *
 * Every canvas is the same numbered grid at the same Canvas dimensions through
 * its own IIIF level 2 service, so nothing dedupes: one `info.json` per canvas
 * is exactly what a renderer that fetched the whole manifest would ask for, and
 * counting them is the O(1)-versus-O(n) assertion.
 */
export const CONTINUOUS_MANIFEST =
    '/demo-manifests/continuous-800/manifest.json';

/** How many canvases that fixture has, and their shared Canvas dimensions. */
export const CONTINUOUS_CANVAS_COUNT = 800;
export const CONTINUOUS_PAGE = { width: 1200, height: 900 };

/** The id of canvas `index` in the continuous fixture, on this base URL. */
export function continuousCanvasId(index: number, origin: string): string {
    return `${origin}/demo-manifests/continuous-800/canvas/${index}`;
}

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

/** Open the numbered-grid fixture. */
export async function openGridManifest(page: Page): Promise<void> {
    await page.goto(`/e2e/harness.html?manifest=${GRID_MANIFEST}`, {
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
    await openRendererManifest(page, TILED_MANIFEST);
}

/**
 * Open any manifest with the Canvas2D renderer selected, and wait until the
 * grid is genuinely on the canvas.
 *
 * Waiting for a feature rather than for a network idle is what makes this
 * usable for every source kind: for a tiled canvas it means the whole
 * `info.json` → pyramid → schedule → decode → paint path completed, and for a
 * size-ladder canvas the same path through the ladder. A source kind the
 * renderer cannot resolve simply never paints, and the wait fails.
 */
export async function openRendererManifest(
    page: Page,
    manifest: string,
    /**
     * Viewer config for the harness to boot with, as its `config` URL
     * parameter takes it. The way a spec reaches a viewing mode or a paged
     * offset without driving the settings UI to get there.
     */
    config?: Record<string, unknown>,
    /**
     * How long to wait for the surface and the first painted feature.
     *
     * A parameter because the 800-canvas fixture is genuinely slower to BOOT
     * than the others, and not for a renderer reason: the viewer chrome — the
     * canvas list, the thumbnail gallery, the label lookups — walks every
     * canvas in the manifest, and on the dev server it does it through Svelte's
     * deep `$state` proxies. The renderer's network and memory behavior is
     * asserted by counters elsewhere, not by this wait.
     */
    timeout = 20_000,
): Promise<void> {
    const query = config
        ? `?manifest=${manifest}&config=${encodeURIComponent(JSON.stringify(config))}`
        : `?manifest=${manifest}`;
    await page.goto(`/e2e/harness.html${query}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout });
    await expect
        .poll(() => findFeature(page, 'bravo'), { timeout })
        .not.toBeNull();
}

/** The renderer's residency counters. */
export interface RendererStats {
    /** Tiles held AND required — what may be painted this frame. */
    residentTileCount: number;
    /** Tiles held in the byte-budgeted opportunistic cache. */
    cachedTileCount: number;
    /** Required set plus opportunistic cache: the number the budget bounds. */
    decodedBytes: number;
    /** The ceiling in force, so a spec asserts against a stated budget. */
    byteBudget: number;
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

/**
 * Which canvases held what, at the last plan.
 *
 * Names, not counts: on an 800-folio manifest "the resident set is bounded"
 * passes just as happily with the wrong three canvases in it.
 */
export interface RendererResidency {
    pyramid: string[];
    thumbnail: string[];
    boxCount: number;
}

export async function getResidency(page: Page): Promise<RendererResidency> {
    return page.locator(SURFACE).evaluate((element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: {
                    getResidency(): RendererResidency;
                };
            }
        ).__triiiceratopsRenderer;
        if (!handle) throw new Error('renderer test handle not installed');
        return handle.getResidency();
    }) as Promise<RendererResidency>;
}

/**
 * State the decoded-byte ceiling this spec asserts against.
 *
 * Budgets are planner inputs so tests supply their own rather than depending on
 * shipped defaults (spec §Further Notes) — and the shipped 128 MB is orders of
 * magnitude above anything a fixture manifest can reach, so an assertion
 * against it would pass without the cache being bounded at all.
 */
export async function setByteBudget(page: Page, bytes: number): Promise<void> {
    await page.locator(SURFACE).evaluate((element, budget: number) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: {
                    setBudget(bytes: number): Promise<void>;
                };
            }
        ).__triiiceratopsRenderer;
        if (!handle) throw new Error('renderer test handle not installed');
        return handle.setBudget(budget);
    }, bytes);
}

/** Animated zoom about a surface-local point, through the real zoom clamp. */
export async function zoomAt(
    page: Page,
    anchor: { x: number; y: number },
    factor: number,
): Promise<void> {
    await page.locator(SURFACE).evaluate(
        (element, args: { anchor: typeof anchor; factor: number }) => {
            const handle = (
                element as HTMLCanvasElement & {
                    __triiiceratopsRenderer?: {
                        zoomAt(
                            anchor: typeof args.anchor,
                            factor: number,
                        ): Promise<void>;
                    };
                }
            ).__triiiceratopsRenderer;
            if (!handle) throw new Error('renderer test handle not installed');
            return handle.zoomAt(args.anchor, args.factor);
        },
        { anchor, factor },
    );
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
 * separately.
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

/**
 * Issue the public `fitBounds` viewport command with a canvas-space box, and
 * wait until the animation it starts has settled.
 *
 * Distinct from `fitWorld`, which is the `0`/`Home` binding: this is the box a
 * CALLER chose, so the fitted scale is not a layout rect's and the zoom clamp
 * is observable through it.
 */
export async function fitCanvasBounds(
    page: Page,
    bounds: { x: number; y: number; width: number; height: number },
    canvasId?: string,
): Promise<void> {
    await page.locator(SURFACE).evaluate(
        (element, args) => {
            const handle = (
                element as HTMLCanvasElement & {
                    __triiiceratopsRenderer?: {
                        fitCanvasBounds(
                            bounds: typeof args.bounds,
                            canvasId?: string,
                        ): Promise<void>;
                    };
                }
            ).__triiiceratopsRenderer;
            if (!handle) throw new Error('renderer test handle not installed');
            return handle.fitCanvasBounds(args.bounds, args.canvasId);
        },
        { bounds, canvasId },
    );
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
 * How many device pixels on the surface are FULLY OPAQUE.
 *
 * The coarsest possible "is anything really on screen?" question, and the one
 * that survives at a scale where a folio is a few pixels across and
 * {@link findFeature} has no feature left to find. Core's own page-placeholder
 * layer paints translucent ink and the surface is cleared to transparent, so an
 * alpha of exactly 255 can only have come from a decoded image the scheduler
 * fetched and the painter drew.
 */
export async function countOpaqueSurfacePixels(page: Page): Promise<number> {
    return page.locator(SURFACE).evaluate((element) => {
        const context = (element as HTMLCanvasElement).getContext('2d');
        if (!context) throw new Error('no 2d context on the surface');
        const { data } = context.getImageData(
            0,
            0,
            (element as HTMLCanvasElement).width,
            (element as HTMLCanvasElement).height,
        );

        let opaque = 0;
        for (let index = 3; index < data.length; index += 4) {
            if (data[index] === 255) opaque += 1;
        }
        return opaque;
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
