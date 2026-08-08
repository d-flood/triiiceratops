/**
 * The scene planner: the renderer's primary test seam (spec §Architecture:
 * planner and painter).
 *
 * A pure function. Given manifest-derived canvas descriptors, viewing mode and
 * direction, the current viewport, whatever image metadata has already been
 * fetched, and the budgets, it returns a **scene plan**. It touches no DOM,
 * performs no I/O, and is deterministic — so it can be imported and called in
 * plain Node with no DOM globals, which is where the large majority of the
 * renderer's decisions are tested.
 *
 * The **painter** (`paintScene.ts`) consumes the plan and a 2D context and does
 * nothing else. If planning and painting interleaved, this seam would not
 * exist and every later ticket would lose its unit tests.
 *
 * ## Level residency
 *
 * For a pyramid-tier canvas whose image service is known, the **required set**
 * is three things (spec §Virtualization: per-canvas level residency):
 *
 * - the **base level** — the coarsest level, covering the whole image in
 *   (typically) one tile. It costs almost nothing and it is what guarantees the
 *   viewer is never blank;
 * - the **full chain of coarser levels**, whole. Pyramid levels are geometric,
 *   so the entire chain is roughly a third of one full level — cheap, and it is
 *   what makes zooming *out* instant as well as in;
 * - the **current level**, for tiles intersecting viewport-plus-margin.
 *
 * `tileDraws` is the resident subset of that, restricted to what is actually on
 * screen and ordered coarsest first — which is **blur-up**: an incomplete
 * current level paints over the coarse chain rather than over nothing.
 *
 * ## What is still to come
 *
 * - the size-ladder source kind — ticket 06;
 * - multi-canvas layout (paged, continuous, viewing direction,
 *   `preserveCanvasScale`, the inter-canvas gap) — ticket 07, which replaces
 *   `layoutCanvases` below with the shared layout function;
 * - distance-based eviction and the byte budget — ticket 08;
 * - thumbnail resolution and its quantized ladder — ticket 09.
 *
 * `mode`, `direction`, `preserveCanvasScale`, and `budgets.byteBudget` are
 * therefore accepted and not yet read. They are in the signature from the first
 * version deliberately: the contract is fixed, so later tickets add behaviour
 * rather than re-cut the seam.
 */

import {
    buildPyramid,
    chooseLevel,
    tileCanvasRect,
    tileKey,
    tilesIntersecting,
    tileUrl,
    type Box,
    type TilePyramid,
} from './tilePyramid';
import type {
    LayoutRect,
    PlannerCanvas,
    PlanSceneInput,
    ResidencyTier,
    ScenePlan,
    TileDraw,
    TileKey,
    TileRequest,
    Viewport,
} from './types';

/** True for a dimension that can be laid out. Guards against 0/NaN/negatives. */
function isUsableDimension(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isLayoutable(canvas: PlannerCanvas): boolean {
    return (
        isUsableDimension(canvas.width) &&
        isUsableDimension(canvas.height) &&
        typeof canvas.id === 'string' &&
        canvas.id.length > 0
    );
}

/**
 * The orientation-invariant measure of how big a canvas is on screen.
 *
 * The geometric mean of the projected width and height, deliberately *not* the
 * projected height alone: height would decide differently for a portrait page
 * in a left-to-right world and a landscape page in a top-to-bottom world at
 * identical visual size (spec §Virtualization: canvas tiers).
 */
export function effectiveSize(
    width: number,
    height: number,
    scale: number,
): number {
    return Math.sqrt(width * scale * height * scale);
}

/**
 * Single-canvas layout, in canvas space.
 *
 * Ticket 07 replaces this with the shared layout function that already handles
 * paged and continuous worlds, viewing direction, the median-height
 * normalization, and the inter-canvas gap. Until then the only supported world
 * is one canvas at the origin — which is exactly the geometry the manifest
 * declares, so nothing here can shift when metadata arrives later.
 */
function layoutCanvases(canvases: PlannerCanvas[]): LayoutRect[] {
    return canvases.map((canvas) => ({
        canvasId: canvas.id,
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
    }));
}

function assignTier(
    canvas: PlannerCanvas,
    scale: number,
    pyramidThreshold: number,
    boxThreshold: number,
): ResidencyTier {
    const size = effectiveSize(canvas.width, canvas.height, scale);
    if (size >= pyramidThreshold) return 'pyramid';
    if (size >= boxThreshold) return 'thumbnail';
    return 'box';
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

/**
 * The zoom floor, **derived** rather than fixed: the scale at which the median
 * canvas reaches the box threshold. Below it there is no information on screen.
 * This scales with the manifest instead of being a tuned percentage of home
 * zoom, which is what lets an 800-folio manifest and a one-page manifest both
 * stop somewhere meaningful.
 */
function deriveMinZoom(
    canvases: PlannerCanvas[],
    boxThreshold: number,
): number {
    if (canvases.length === 0) return 0;

    const sizes = canvases.map((canvas) =>
        Math.sqrt(canvas.width * canvas.height),
    );

    return boxThreshold / median(sizes);
}

/** The viewport as a canvas-space box. */
function viewportBox(viewport: Viewport): Box {
    const halfWidth = viewport.width / (2 * viewport.scale);
    const halfHeight = viewport.height / (2 * viewport.scale);

    return {
        x: viewport.centre.x - halfWidth,
        y: viewport.centre.y - halfHeight,
        width: halfWidth * 2,
        height: halfHeight * 2,
    };
}

/**
 * The residency margin: the viewport box inflated by a factor.
 *
 * Expressed in viewport-relative terms rather than in tile or canvas counts, so
 * it is correct for a wide world and a tall one without an axis conditional
 * (spec §Virtualization: canvas tiers).
 */
function inflate(box: Box, factor: number): Box {
    const width = box.width * factor;
    const height = box.height * factor;

    return {
        x: box.x - (width - box.width) / 2,
        y: box.y - (height - box.height) / 2,
        width,
        height,
    };
}

function intersects(a: Box, b: Box): boolean {
    return (
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
    );
}

/**
 * The required set and the draw list for one pyramid-tier canvas.
 *
 * Priority is the canvas-space distance from the viewport centre to the tile's
 * centre — distance, not discovery order, and not rank. Coarser levels break
 * ties, so blur-up coverage lands fractionally ahead of the detail that will
 * replace it while the ordering stays centre-out.
 */
function planPyramid(
    canvas: PlannerCanvas,
    pyramid: TilePyramid,
    rect: LayoutRect,
    viewport: Viewport,
    minPixelRatio: number,
    marginFactor: number,
    residentTiles: ReadonlySet<TileKey>,
    requests: TileRequest[],
    draws: TileDraw[],
): void {
    const visible = viewportBox(viewport);
    const margin = inflate(visible, marginFactor);

    // Screen pixels per full-resolution image pixel. The image is fitted into
    // its manifest-declared box, so the box's canvas-space width — not the
    // service's pixel width — is what relates the two spaces.
    const imageScale = (viewport.scale * rect.width) / pyramid.width;
    const current = chooseLevel(pyramid, imageScale, minPixelRatio);

    for (const level of pyramid.levels) {
        if (level.level > current.level) break;

        // The coarse chain is held WHOLE (a `null` box); only the current level
        // is restricted to viewport-plus-margin. That asymmetry is the point:
        // the chain is geometric and therefore cheap, and holding all of it is
        // what makes zooming out instant.
        const box = level.level === current.level ? margin : null;

        for (const { column, row } of tilesIntersecting(
            pyramid,
            level,
            rect,
            box,
        )) {
            const key = tileKey(canvas.id, level.level, column, row);
            const tileBox = tileCanvasRect(pyramid, level, column, row, rect);
            const centreX = tileBox.x + tileBox.width / 2;
            const centreY = tileBox.y + tileBox.height / 2;

            requests.push({
                key,
                canvasId: canvas.id,
                level: level.level,
                url: tileUrl(pyramid, level, column, row),
                priority: Math.hypot(
                    centreX - viewport.centre.x,
                    centreY - viewport.centre.y,
                ),
            });

            // Drawn only if held AND actually on screen: the margin exists to
            // prefetch, not to paint.
            if (residentTiles.has(key) && intersects(tileBox, visible)) {
                draws.push({ key, level: level.level, ...tileBox });
            }
        }
    }
}

export function planScene(input: PlanSceneInput): ScenePlan {
    const { canvases, viewport, budgets, knownMetadata } = input;
    const residentTiles = input.residentTiles ?? new Set<TileKey>();

    const layoutable = canvases.filter(isLayoutable);
    const layout = layoutCanvases(layoutable);
    const rects = new Map(layout.map((rect) => [rect.canvasId, rect]));

    const tiers: Record<string, ResidencyTier> = {};
    const evictable: string[] = [];
    const metadataRequests: string[] = [];
    const tileRequests: TileRequest[] = [];
    const tileDraws: TileDraw[] = [];

    for (const canvas of layoutable) {
        const tier = assignTier(
            canvas,
            viewport.scale,
            budgets.pyramidThreshold,
            budgets.boxThreshold,
        );
        tiers[canvas.id] = tier;

        // A box-tier canvas holds no network resource and no texture, so
        // whatever it held is droppable. Residency is a pure function of the
        // viewport: the same viewport always yields the same set, regardless of
        // how the user arrived (spec — eviction is distance-based, not LRU).
        if (tier === 'box') {
            evictable.push(canvas.id);
        }

        // A static-image source has exactly one known URL and no service, so it
        // has nothing to discover and nothing to tile (user story 29).
        if (canvas.source.kind !== 'service') continue;
        // Only the pyramid tier fetches tiles, and the per-level rules are
        // nested inside the tier: a canvas below it releases everything,
        // including its base level. Applied without that gate, "the base level
        // is never evicted" would mean 800 resident base tiles on an 800-folio
        // manifest (spec §Further Notes).
        if (tier !== 'pyramid') continue;

        const facts = knownMetadata[canvas.id];
        if (!facts) {
            // Lazy and per-canvas: layout already happened without it, so this
            // costs one request when the canvas needs pixels rather than one
            // per canvas before anything renders.
            metadataRequests.push(canvas.id);
            continue;
        }

        const pyramid = buildPyramid(canvas.source.serviceId, facts);
        // No tiling advertised: a size-ladder source, which is ticket 06.
        if (!pyramid) continue;

        planPyramid(
            canvas,
            pyramid,
            rects.get(canvas.id)!,
            viewport,
            budgets.minPixelRatio,
            budgets.marginFactor,
            residentTiles,
            tileRequests,
            tileDraws,
        );
    }

    return {
        layout,
        tiers,
        // Centre-out, coarser first on a tie. Sorted here rather than per
        // canvas so a multi-canvas world (ticket 07) orders across canvases too.
        tileRequests: tileRequests.sort(
            (a, b) => a.priority - b.priority || a.level - b.level,
        ),
        // Coarsest first, so a finer tile paints OVER the blur-up beneath it.
        tileDraws: tileDraws.sort((a, b) => a.level - b.level),
        thumbnailRequests: [],
        metadataRequests,
        evictable,
        minZoom: deriveMinZoom(layoutable, budgets.boxThreshold),
    };
}
