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
 * - the **full chain of coarser levels**, each over the same
 *   viewport-plus-margin box as the current level. Pyramid levels are
 *   geometric, so the whole chain then really is roughly a third of the current
 *   level — cheap, and it is what makes zooming *out* instant as well as in;
 * - the **current level**, for tiles intersecting viewport-plus-margin.
 *
 * `tileDraws` is the resident subset of that, restricted to what is actually on
 * screen and ordered coarsest first — which is **blur-up**: an incomplete
 * current level paints over the coarse chain rather than over nothing.
 *
 * A **size-ladder source** — a level0 service that advertises only fixed whole
 * images — is planned by `planSizeLadder` below, which expresses each rung as a
 * one-tile level so the same residency, priority, and blur-up rules apply.
 * Which services take that branch is decided by `isSizeLadderSource`, and the
 * decision is load-bearing: "advertises no tiles" alone is not level0.
 *
 * ## Layout
 *
 * `layoutCanvases` below is a **translation**, not an implementation: the
 * positions come from the shared layout function in `components/osdLayout`,
 * which the export path uses too, so there is one set of coordinates for a
 * given manifest and no cumulative-offset arithmetic anywhere in the renderer.
 * What this module owns is the geometry each canvas is laid out *with*
 * (`resolveGeometry`) and the conversion of the layout module's normalized gap
 * into canvas-space units.
 *
 * ## What is still to come
 *
 * - continuous mode's virtualization: the layout function already positions a
 *   continuous world, but the host deliberately feeds it only the canvases on
 *   screen, because laying out an 800-folio manifest without eviction is the
 *   behaviour this epic exists to remove — ticket 08;
 * - distance-based eviction and the byte budget — ticket 08;
 * - thumbnail resolution and its quantized ladder — ticket 09.
 *
 * `budgets.byteBudget` is therefore accepted and not yet read. It is in the
 * signature from the first version deliberately: the contract is fixed, so
 * later tickets add behaviour rather than re-cut the seam.
 */

import { getCanvasDisplayLayouts } from '../components/osdLayout';
import {
    buildSizeLadder,
    chooseRung,
    exceedsDecodedPixelCap,
    isLevel0Profile,
    rungFallback,
    rungUrl,
    type SizeLadder,
} from './sizeLadder';
import {
    buildPyramid,
    chooseLevel,
    DERIVED_TILE_SIZE,
    tileCanvasRect,
    tileKey,
    tilesIntersecting,
    tileUrl,
    type Box,
    type TilePyramid,
} from './tilePyramid';
import type {
    ImageServiceFacts,
    LayoutRect,
    PlannerCanvas,
    PlanSceneInput,
    PlanWorldInput,
    Point,
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

function hasUsableId(canvas: PlannerCanvas): boolean {
    return typeof canvas.id === 'string' && canvas.id.length > 0;
}

/** A canvas with the geometry layout will actually use, in canvas space. */
interface SizedCanvas {
    canvas: PlannerCanvas;
    width: number;
    height: number;
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

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

/**
 * The geometry each canvas is laid out with, in canvas space.
 *
 * Three rules, in this order, and the order is the decision:
 *
 * 1. **The manifest wins, permanently.** Declared Canvas dimensions are the
 *    authoritative geometry even where the image service disagrees — which is
 *    routine, and is why the canvas-space/image-space distinction exists.
 *    Service dimensions govern only the tile pyramid, and the image is fitted
 *    into its manifest-declared box, so layout never shifts when tiles arrive.
 *    The alternative moves the thing under the user's cursor as tiles load, and
 *    breaks annotation geometry, which is already persisted in canvas space.
 * 2. **A canvas the manifest never sized takes what a service reports** — the
 *    *reflow*. This is the only case in which fetched metadata can move
 *    anything, and it moves it because there was nothing there to contradict.
 * 3. **Failing both, the median of its siblings.** A guess, and deliberately a
 *    guess: "just fetch it" is the reflex, and it is what restores the fetch
 *    storm for any manifest with sparse metadata. Positioning is never blocked
 *    on a request (spec §Coordinate model and layout).
 *
 * A canvas with no id, and one that rule 3 cannot help either (nothing in the
 * manifest has dimensions), is dropped rather than laid out as NaN.
 */
function resolveGeometry(
    canvases: PlannerCanvas[],
    knownMetadata: Record<string, ImageServiceFacts>,
): SizedCanvas[] {
    const usable = canvases.filter(hasUsableId);

    const declared = usable.filter(
        (canvas) =>
            isUsableDimension(canvas.width) && isUsableDimension(canvas.height),
    );
    const guess =
        declared.length > 0
            ? {
                  width: median(declared.map((canvas) => canvas.width!)),
                  height: median(declared.map((canvas) => canvas.height!)),
              }
            : null;

    return usable
        .map((canvas): SizedCanvas | null => {
            if (
                isUsableDimension(canvas.width) &&
                isUsableDimension(canvas.height)
            ) {
                return { canvas, width: canvas.width, height: canvas.height };
            }

            const facts = knownMetadata[canvas.id];
            if (
                facts &&
                isUsableDimension(facts.width) &&
                isUsableDimension(facts.height)
            ) {
                return { canvas, width: facts.width, height: facts.height };
            }

            return guess
                ? { canvas, width: guess.width, height: guess.height }
                : null;
        })
        .filter((sized): sized is SizedCanvas => sized !== null);
}

/**
 * Multi-canvas layout, in canvas space — delegated **entirely** to the shared
 * layout function in `components/osdLayout`.
 *
 * There is one layout implementation in this repository and this is not it.
 * Paged spreads, the four viewing directions, median-height normalization, the
 * `[0.25, 4]` scale clamp, and the cumulative inter-canvas offset all live
 * there, are exercised from Node, and are shared with the export path. A second
 * copy here would be a second set of positions for the same manifest.
 *
 * What this function does own is the **translation between the two callers'
 * units**. The layout module's world is normalized (a canvas is one unit wide);
 * the renderer's world is canvas space, where a page is a few thousand units
 * across. Passing each canvas's real extent as its layout `width` is what puts
 * the answer back in canvas space, and it is why the gap has to be computed
 * here: an absolute default expressed in normalized units would be a sub-pixel
 * hairline in this one.
 *
 * The gap is a fraction of the median extent along the axis the world flows in,
 * so it reads the same on a folio manifest and a postage-stamp one, and so a
 * vertical world is spaced by heights rather than by widths.
 */
function layoutCanvases(
    sized: SizedCanvas[],
    input: PlanWorldInput,
): LayoutRect[] {
    if (sized.length === 0) return [];

    const isVertical =
        input.direction === 'top-to-bottom' ||
        input.direction === 'bottom-to-top';
    const flowExtents = sized.map((entry) =>
        isVertical && input.mode === 'continuous' ? entry.height : entry.width,
    );

    return getCanvasDisplayLayouts(
        sized.map((entry) => ({
            canvasId: entry.canvas.id,
            x: 0,
            y: 0,
            width: entry.width,
            sourceWidth: entry.width,
            sourceHeight: entry.height,
            // Layout carries a payload through untouched; the renderer needs
            // none, because it looks its canvases up by id.
            tileSource: null,
        })),
        {
            mode: input.mode,
            direction: input.direction,
            preserveCanvasScale: input.preserveCanvasScale,
            gap: input.budgets.gapFraction * median(flowExtents),
        },
    ).layouts;
}

/**
 * The tier is decided from the canvas's **projected** size — its LAYOUT rect
 * scaled by the viewport, not its manifest dimensions.
 *
 * The two are the same only in a single-canvas world. Normalization scales a
 * canvas to the median height, so a page the manifest declares at 400 px and
 * layout draws at 4000 covers ten times the screen the manifest figure
 * predicts; deciding from the manifest would put a canvas that fills the
 * viewport in the box tier.
 */
function assignTier(
    rect: LayoutRect,
    scale: number,
    pyramidThreshold: number,
    boxThreshold: number,
): ResidencyTier {
    const size = effectiveSize(rect.width, rect.height, scale);
    if (size >= pyramidThreshold) return 'pyramid';
    if (size >= boxThreshold) return 'thumbnail';
    return 'box';
}

/**
 * The zoom floor, **derived** rather than fixed: the scale at which the median
 * canvas reaches the box threshold. Below it there is no information on screen.
 * This scales with the manifest instead of being a tuned percentage of home
 * zoom, which is what lets an 800-folio manifest and a one-page manifest both
 * stop somewhere meaningful.
 *
 * Measured on the laid-out rects for the same reason the tier is: normalization
 * is what decides how big a canvas actually is on screen.
 */
function deriveMinZoom(layout: LayoutRect[], boxThreshold: number): number {
    if (layout.length === 0) return 0;

    const sizes = layout.map((rect) => Math.sqrt(rect.width * rect.height));

    return boxThreshold / median(sizes);
}

/**
 * The two things about a scene that bound the **viewport** — the world's layout
 * and the derived zoom floor — without planning the scene.
 *
 * A separate, cheap entry point because the host clamps on every pointer sample:
 * a pan clamps its centre, a pinch clamps its scale as well, and momentum clamps
 * once per frame. Answering those from a full {@link planScene} would build the
 * pyramid and enumerate the required tile set several hundred times a second at
 * a 120 Hz pinch, for two numbers that depend on neither. Tile enumeration
 * belongs to the frame loop, once per frame (see `CanvasHost.paint`).
 *
 * Neither output depends on the viewport or on what is resident — which is
 * exactly why this can skip all of it, and why the two cannot drift: `planScene`
 * returns these very values by calling this.
 */
export function planViewportLimits(input: PlanWorldInput): {
    layout: LayoutRect[];
    minZoom: number;
} {
    const layout = layoutCanvases(
        resolveGeometry(input.canvases, input.knownMetadata),
        input,
    );

    return {
        layout,
        minZoom: deriveMinZoom(layout, input.budgets.boxThreshold),
    };
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
 * Canvas-space distance from a point to the **nearest point of** a box — zero
 * when the box contains it.
 *
 * Distance to the box, deliberately not to its centre. A coarse tile is huge in
 * canvas space, so its centre can be far from the viewport centre while the tile
 * covers it: measured centre-to-centre, the base tile that guarantees the viewer
 * is never blank is scheduled *behind* dozens of current-level tiles at any
 * off-centre entry point (a deep link, a programmatic view), which is exactly
 * where blur-up is needed most.
 */
function distanceToBox(point: Point, box: Box): number {
    const nearestX = Math.min(Math.max(point.x, box.x), box.x + box.width);
    const nearestY = Math.min(Math.max(point.y, box.y), box.y + box.height);

    return Math.hypot(point.x - nearestX, point.y - nearestY);
}

/**
 * The required set and the draw list for one pyramid-tier canvas.
 *
 * Priority is the canvas-space distance from the viewport centre to the tile —
 * distance, not discovery order, and not rank. Coarser levels break ties, so
 * blur-up coverage lands ahead of the detail that will replace it while the
 * ordering stays centre-out.
 */
function planPyramid(
    canvas: PlannerCanvas,
    pyramid: TilePyramid,
    rect: LayoutRect,
    viewport: Viewport,
    dpr: number,
    minPixelRatio: number,
    marginFactor: number,
    residentTiles: ReadonlySet<TileKey>,
    requests: TileRequest[],
    draws: TileDraw[],
): void {
    const visible = viewportBox(viewport);
    const margin = inflate(visible, marginFactor);

    // DEVICE pixels per full-resolution image pixel: the viewport is measured in
    // CSS pixels, and a level chosen from those never reaches full resolution on
    // a HiDPI screen. The image is fitted into its manifest-declared box, so the
    // box's canvas-space width — not the service's pixel width — is what relates
    // canvas space to image space.
    const imageScale = (viewport.scale * dpr * rect.width) / pyramid.width;
    const current = chooseLevel(pyramid, imageScale, minPixelRatio);

    for (const level of pyramid.levels) {
        if (level.level > current.level) break;

        // Every level is restricted to viewport-plus-margin. The base level is
        // the one exception, and only because it is a single tile by
        // construction — holding it whole costs nothing and is what guarantees
        // the viewer is never blank.
        //
        // Holding the coarse chain WHOLE is the reading that makes the spec's
        // "the chain is roughly a third of the current level" false: a whole
        // level costs O(image area) while the current level costs O(viewport
        // area), so the ratio diverges with image size — a 30000² scan wants
        // over a gigabyte of chain against 10 MB of current level. Restricted to
        // the same box, the geometric sum really is a third, and the required
        // set stays a function of the viewport rather than of the image.
        const box = level.level === 0 ? null : margin;

        for (const { column, row } of tilesIntersecting(
            pyramid,
            level,
            rect,
            box,
        )) {
            const key = tileKey(canvas.id, level.level, column, row);
            const tileBox = tileCanvasRect(pyramid, level, column, row, rect);

            requests.push({
                key,
                canvasId: canvas.id,
                level: level.level,
                url: tileUrl(pyramid, level, column, row),
                priority: distanceToBox(viewport.centre, tileBox),
            });

            // Drawn only if held AND actually on screen: the margin exists to
            // prefetch, not to paint.
            if (residentTiles.has(key) && intersects(tileBox, visible)) {
                draws.push({ key, level: level.level, ...tileBox });
            }
        }
    }
}

/**
 * The required set and the draw list for one **size-ladder source** — a level0
 * service that advertises only fixed whole images and can never be tiled.
 *
 * Deliberately expressed as tiles: a rung is a one-tile "level" covering the
 * whole canvas, keyed in the same namespace as a pyramid tile (a canvas is one
 * kind or the other, so the keys cannot collide). That is not a trick — it is
 * what makes every rule the scheduler and the painter already implement apply
 * here for free: abort on supersede, the centre-out priority queue, the negative
 * cache, off-thread decode, the decoded-byte counter, and blur-up paint order.
 * Modelled as a separate "whole image" channel instead, each of those would have
 * to be written a second time, and a size-ladder canvas would be the one place
 * in the renderer where residency is not a pure function of the viewport.
 *
 * The chain below the chosen rung is required for the same reason the pyramid's
 * coarse chain is: ladders are geometric in practice, so the whole chain is
 * roughly a third of the chosen rung, and holding it is what makes zooming out
 * instant and an arriving rung paint over something rather than over nothing.
 */
function planSizeLadder(
    canvas: PlannerCanvas,
    ladder: SizeLadder,
    rect: LayoutRect,
    viewport: Viewport,
    dpr: number,
    minPixelRatio: number,
    marginFactor: number,
    maxDecodedPixels: number,
    residentTiles: ReadonlySet<TileKey>,
    requests: TileRequest[],
    draws: TileDraw[],
): void {
    const visible = viewportBox(viewport);
    const box: Box = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    };
    // The residency margin, applied to rungs exactly as `planPyramid` applies
    // it to levels — and for the same reason. A rung is a whole image, so a
    // canvas two spreads away that kept its chain would hold its FULL
    // RESOLUTION scan resident: required-set membership drives eviction, so
    // nothing would ever release it.
    //
    // The base rung is the one exception, mirroring `level.level === 0 ? null
    // : margin`: it is the cheapest image the service has and it is what
    // guarantees the canvas is never blank when it comes back into view.
    const inMargin = intersects(box, inflate(visible, marginFactor));

    // The same quantity `planPyramid` computes, so one `minPixelRatio` governs
    // sharpness for both source kinds.
    const imageScale = (viewport.scale * dpr * rect.width) / ladder.width;
    const current = chooseRung(
        ladder,
        imageScale,
        minPixelRatio,
        maxDecodedPixels,
    );

    // Every rung covers the whole canvas, so there is nothing to intersect and
    // one priority for all of them.
    const priority = distanceToBox(viewport.centre, box);

    for (const rung of ladder.rungs) {
        if (rung.index > current.index) break;
        if (rung.index > 0 && !inMargin) break;

        const key = tileKey(canvas.id, rung.index, 0, 0);
        const fallback = rungFallback(ladder, rung);

        requests.push({
            key,
            canvasId: canvas.id,
            level: rung.index,
            url: rungUrl(ladder, rung),
            priority,
            ...(fallback ? { fallback } : {}),
        });

        if (residentTiles.has(key) && intersects(box, visible)) {
            draws.push({ key, level: rung.index, ...box });
        }
    }
}

/**
 * Whether a **tile-less** service is a size-ladder source rather than a level
 * 1/2 endpoint that merely omitted `tiles`.
 *
 * Only asked once `buildPyramid` has already declined, and it needs positive
 * evidence of level0 rather than the absence of tiling: guessing "level0"
 * from a missing key turns every tile-less level 1/2 service into a
 * whole-master download (see the call site).
 *
 * Advertised `sizes[]` counts as that evidence on its own. A service that
 * publishes a list of prepared whole images can always be asked for one of
 * them, whatever its compliance level, and preferring that list to a derived
 * grid is both cheaper and closer to what it wants to serve. Failing that, the
 * declared profile decides — from `info.json` if it was parsed there, and
 * otherwise from the manifest, which `resolveCanvasImage` reads without any
 * fetch at all.
 */
function isSizeLadderSource(
    facts: ImageServiceFacts,
    profile: string | null,
): boolean {
    return (
        (facts.sizes?.length ?? 0) > 0 ||
        facts.level0 === true ||
        isLevel0Profile(profile)
    );
}

export function planScene(input: PlanSceneInput): ScenePlan {
    const { canvases, viewport, budgets, knownMetadata } = input;
    const residentTiles = input.residentTiles ?? new Set<TileKey>();
    // 1 is the CSS-pixel screen, which is what a caller that does not know its
    // backing store is describing.
    const dpr = input.dpr && input.dpr > 0 ? input.dpr : 1;

    // The same function the host's per-sample clamping calls, so the world the
    // pan constraint is measured against can never diverge from the world that
    // is painted.
    const { layout, minZoom } = planViewportLimits(input);
    const rects = new Map(layout.map((rect) => [rect.canvasId, rect]));
    // Laid out, therefore plannable — and in layout's own order, so a canvas
    // dropped for having no usable geometry is absent from both.
    const layoutable = canvases.filter((canvas) => rects.has(canvas.id));

    const tiers: Record<string, ResidencyTier> = {};
    const evictable: string[] = [];
    const overCapCanvases: string[] = [];
    const metadataRequests: string[] = [];
    const tileRequests: TileRequest[] = [];
    const tileDraws: TileDraw[] = [];

    for (const canvas of layoutable) {
        const rect = rects.get(canvas.id)!;
        const tier = assignTier(
            rect,
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

        // A service that advertises tiles is an ordinary pyramid, whatever its
        // compliance level — a level0 one simply has its levels restricted to
        // the advertised scale factors, which `buildPyramid` already is because
        // it builds levels from `scaleFactors` when the service declares them.
        const pyramid = buildPyramid(canvas.source.serviceId, facts);
        if (pyramid) {
            planPyramid(
                canvas,
                pyramid,
                rect,
                viewport,
                dpr,
                budgets.minPixelRatio,
                budgets.marginFactor,
                residentTiles,
                tileRequests,
                tileDraws,
            );
            continue;
        }

        // No tiles advertised — which is TWO different services, and treating
        // them alike is how the decoded-pixel cap gets defeated.
        //
        // A level0 service without tiles is a size-ladder source: fixed whole
        // images, and if it advertises no sizes either, the one canonical
        // whole-image URL level0 compliance guarantees. A level 1/2 service
        // without tiles is not — `tiles` is optional at every compliance level,
        // and Cantaloupe and IIP both ship configurations that omit it, while
        // still answering any region at any size. Given a ladder, such a
        // service's only rung is `full/max`: the entire master, 108 megapixels
        // for a 12000x9000 scan, and the cap cannot refuse it because
        // `chooseRung` must keep the cheapest rung to avoid a blank canvas.
        // It gets a derived power-of-two pyramid instead.
        if (isSizeLadderSource(facts, canvas.source.profile)) {
            const ladder = buildSizeLadder(canvas.source.serviceId, facts);
            if (!ladder) continue;

            if (exceedsDecodedPixelCap(ladder, budgets.maxDecodedPixels)) {
                overCapCanvases.push(canvas.id);
            }

            planSizeLadder(
                canvas,
                ladder,
                rect,
                viewport,
                dpr,
                budgets.minPixelRatio,
                budgets.marginFactor,
                budgets.maxDecodedPixels,
                residentTiles,
                tileRequests,
                tileDraws,
            );
            continue;
        }

        const derived = buildPyramid(
            canvas.source.serviceId,
            facts,
            DERIVED_TILE_SIZE,
        );
        if (!derived) continue;

        planPyramid(
            canvas,
            derived,
            rect,
            viewport,
            dpr,
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
        overCapCanvases,
        minZoom,
    };
}
