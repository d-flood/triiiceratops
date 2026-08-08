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
 * positions come from the shared layout function in `components/canvasLayout`,
 * which the export path uses too, so there is one set of coordinates for a
 * given manifest and no cumulative-offset arithmetic anywhere in the renderer.
 * What this module owns is the geometry each canvas is laid out *with*
 * (`resolveGeometry`). The gap is not translated here: layout takes a fraction
 * and resolves it against its own laid-out extents.
 *
 * ## Virtualization
 *
 * The whole manifest is laid out — layout is pure arithmetic over manifest
 * dimensions and costs no network — but only the canvases in the **residency
 * window** are allowed to hold anything (`residencyWindow` below). Everything
 * else is box tier: no metadata request, no tiles, no texture, whatever its
 * projected size. That gate is what makes an 800-folio manifest cost O(1)
 * requests to open, and it is deliberately positional rather than size-based:
 * `assignTier` decides from projected size alone and cannot tell canvas 400
 * from canvas 4, so relying on the tier alone would give every canvas in the
 * input a base tile and an `info.json`.
 *
 * ## The thumbnail tier
 *
 * Between the two thresholds a canvas holds ONE small image rather than a
 * pyramid (`planThumbnail` below, resolved by `thumbnailLadder.ts`). Three
 * things keep that affordable on a manifest where the residency window can hold
 * fifty such canvases at once — the derived zoom floor is exactly that case:
 * the size is **quantized to a rung** so a zoom sweep reuses URLs instead of
 * minting one per frame; the requests are **gated on a stable view**, so a
 * flick past a hundred folios asks for none of them; and they go into the same
 * bounded, centre-out, byte-budgeted scheduler as the tiles, so the concurrency
 * cap is genuinely global and the nearest canvas is served first.
 *
 * `budgets.byteBudget` is not read here: it bounds the **opportunistic cache**,
 * which holds what was recently dropped from the required set, and that is the
 * host's tile scheduler (`tileScheduler.ts`). The planner has no lever over it
 * by construction — required-set membership is a pure function of the viewport
 * — which is exactly why the thing this module bounds is what ENTERS the
 * required set.
 */

import { getCanvasDisplayLayouts } from '../components/canvasLayout';
import {
    boxContains,
    distanceToBox,
    nearestRect,
    worldBounds,
} from './layoutQueries';
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
    quantizeRung,
    resolveThumbnail,
    THUMBNAIL_BASE_RUNG,
    THUMBNAIL_RUNGS,
    type ThumbnailSource,
} from './thumbnailLadder';
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
    ResidencyTier,
    ScenePlan,
    ThumbnailRequest,
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
 * The box a canvas is laid out in when nothing at all is known about its shape:
 * no declared dimensions, no fetched service facts, and no sibling to take a
 * median from.
 *
 * Square, and its absolute size does not matter — a world of one such canvas is
 * fitted to the viewport, and a world with siblings never reaches this rung.
 * What matters is that there IS one. Dropping the canvas instead looks like a
 * safe refusal and is a dead end: an unlaid-out canvas gets no tier, therefore
 * no metadata request, therefore no reflow, so the folio that a fetch would
 * have sized is blank permanently rather than briefly (user story 32).
 */
const UNSIZED_CANVAS_PLACEHOLDER = { width: 1000, height: 1000 };

/** The aspect ratio of a box, or null when it has none. */
function aspectOf(box: { width: number; height: number } | null) {
    return box && isUsableDimension(box.width) && isUsableDimension(box.height)
        ? box.height / box.width
        : null;
}

/**
 * The geometry each canvas is laid out with, in canvas space.
 *
 * Four rungs, in this order, and the order is the decision:
 *
 * 1. **The manifest wins, permanently.** Declared Canvas dimensions are the
 *    authoritative geometry even where the image service disagrees — which is
 *    routine, and is why the canvas-space/image-space distinction exists.
 *    Service dimensions govern only the tile pyramid, and the image is fitted
 *    into its manifest-declared box, so layout never shifts when tiles arrive.
 *    The alternative moves the thing under the user's cursor as tiles load, and
 *    breaks annotation geometry, which is already persisted in canvas space.
 *    Applied **per axis**: a Canvas that states a width and omits its height
 *    keeps the width it stated and takes only the missing axis from below.
 *    Treating a half-declared Canvas as undeclared throws away a figure the
 *    manifest was explicit about.
 * 2. **A canvas the manifest never sized takes what a service reports** — the
 *    *reflow*. This is the only case in which fetched metadata can move
 *    anything, and it moves it because there was nothing there to contradict.
 * 3. **Failing both, the median of its siblings.** A guess, and deliberately a
 *    guess: "just fetch it" is the reflex, and it is what restores the fetch
 *    storm for any manifest with sparse metadata. Positioning is never blocked
 *    on a request (spec §Coordinate model and layout).
 *
 *    The siblings are the canvases in *this* input, which is as much of the
 *    manifest as the host has to lay out: the whole of it in continuous mode,
 *    and the spread on screen in paged and individuals mode. Virtualization is
 *    positional (see `residencyWindow`), not a smaller input, so the median a
 *    continuous world guesses from really is the manifest's — and it still
 *    needs the floor below, because an individuals-mode input is ONE canvas.
 * 4. **Failing even that, {@link UNSIZED_CANVAS_PLACEHOLDER}.** The rung that
 *    makes the drop unreachable, and it is reachable itself on the path users
 *    actually take: in individuals and continuous mode the host feeds ONE
 *    canvas, so an unsized canvas there has no siblings to take a median from.
 *
 * Only a canvas with no usable id is dropped: it cannot be keyed, so nothing
 * downstream could name it.
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
            : UNSIZED_CANVAS_PLACEHOLDER;

    return usable.map((canvas): SizedCanvas => {
        const facts = knownMetadata[canvas.id];
        const reported =
            facts &&
            isUsableDimension(facts.width) &&
            isUsableDimension(facts.height)
                ? { width: facts.width, height: facts.height }
                : null;
        const fallback = reported ?? guess;

        // Whichever axes the manifest stated, kept; the rest taken from the
        // fallback box, and shaped by its aspect ratio so a canvas that stated
        // one axis is not silently reshaped into a sibling's proportions.
        const aspect = aspectOf(fallback) ?? 1;
        const width = isUsableDimension(canvas.width)
            ? canvas.width
            : isUsableDimension(canvas.height)
              ? canvas.height / aspect
              : fallback.width;
        const height = isUsableDimension(canvas.height)
            ? canvas.height
            : isUsableDimension(canvas.width)
              ? canvas.width * aspect
              : fallback.height;

        return { canvas, width, height };
    });
}

/**
 * Multi-canvas layout, in canvas space — delegated **entirely** to the shared
 * layout function in `components/canvasLayout`.
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
 * the answer back in canvas space.
 *
 * The gap goes across as a **fraction**, which layout resolves itself. It reads
 * the same on a folio manifest and a postage-stamp one either way; what the
 * fraction buys is that it is resolved against the extents layout actually laid
 * out — after median-height normalization, on the axis layout already chose —
 * rather than against the raw manifest figures this function can see, which are
 * a different quantity on a different axis whenever normalization is not the
 * identity.
 */
function layoutCanvases(
    sized: SizedCanvas[],
    input: PlanWorldInput,
): LayoutRect[] {
    if (sized.length === 0) return [];

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
            gapFraction: input.gapFraction,
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
 * The three things about a scene that bound the **viewport** — the world's
 * layout, its outer bounds, and the derived zoom floor — without planning the
 * scene.
 *
 * A separate, cheap entry point because the host clamps on every pointer sample:
 * a pan clamps its centre, a pinch clamps its scale as well, and momentum clamps
 * once per frame. Answering those from a full {@link planScene} would build the
 * pyramid and enumerate the required tile set several hundred times a second at
 * a 120 Hz pinch, for two numbers that depend on neither. Tile enumeration
 * belongs to the frame loop, once per frame (see `CanvasHost.paint`).
 *
 * No output depends on the viewport or on what is resident — which is exactly
 * why this can skip all of it, and why the two cannot drift: `planScene`
 * returns these very values by calling this.
 *
 * `bounds` is here rather than left to the caller for the same reason the memo
 * around this function exists: the pan constraint runs on every pointer sample
 * and a min/max over 800 rects per sample is the very O(manifest)-per-sample
 * shape this entry point was split out to avoid. Computed once, beside the
 * layout it summarizes.
 */
export function planViewportLimits(input: PlanWorldInput): {
    layout: LayoutRect[];
    bounds: Box | null;
    minZoom: number;
} {
    const layout = layoutCanvases(
        resolveGeometry(input.canvases, input.knownMetadata),
        input,
    );

    return {
        layout,
        bounds: worldBounds(layout),
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
 * (spec §Virtualization: canvas tiers). A canvas-count margin needs the
 * conditional and will get one direction wrong: a left-to-right world is wide
 * and short, a top-to-bottom world tall and narrow.
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

/** Contains nothing, so an empty world reaches no fallback. */
const EMPTY_BOX: Box = { x: 0, y: 0, width: -1, height: -1 };

function intersects(a: Box, b: Box): boolean {
    return (
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
    );
}

/**
 * Which canvases are near enough the viewport to be allowed to hold anything.
 *
 * This is the whole of continuous mode's virtualization, and it is **positional
 * by necessity**. The residency tier is decided from projected size alone
 * ({@link assignTier}), which cannot distinguish canvas 400 from canvas 4: at
 * reading zoom every canvas in an 800-folio manifest projects the same way, so
 * a tier-only gate hands every one of them a base tile and an `info.json` —
 * O(n) requests to open, which is the behaviour this epic exists to remove.
 * A canvas outside this set is box tier whatever its size: no network, no
 * texture, layout rect only.
 *
 * Two rules, and both are in the spec for reasons an implementer would
 * otherwise resolve by reaching for a canvas count:
 *
 * 1. **The viewport rect inflated by `marginFactor`.** A rect, intersected
 *    against layout rects, so a wide left-to-right world and a tall
 *    top-to-bottom one are handled by the same arithmetic. Margin cost is
 *    quadratic in area — doubling the factor quadruples the tiles — so the
 *    margin stays modest and the byte budget is spent on the opportunistic
 *    cache instead. This is the first knob to reach for and the wrong one.
 * 2. **±1 canvas beyond the ones actually on screen**, so turning the page is
 *    instant (spec §Virtualization: canvas tiers). Stated for continuous mode,
 *    applied in every mode because it cannot do anything in the others: paged
 *    and individuals feed at most a spread, and every member of a spread is
 *    either on screen or the neighbour of something that is.
 *
 * Membership is a pure function of the viewport and nothing else — not of how
 * the user got here. That is what makes the resident set identical whether the
 * reader scrolled to canvas 400 directly or arrived by way of canvas 700, and
 * it is why eviction is distance-based rather than LRU: an LRU makes residency
 * a function of scroll history, which is neither reproducible nor testable.
 *
 * **A viewport INSIDE the world always holds something**, and that is a rule
 * rather than a consequence of the two above. Both of them key off
 * *intersection* with a layout rect, and a viewport can be inside the world and
 * intersect none: the inter-canvas gutter is a fraction of a page wide, so a
 * deep enough zoom centred inside it makes even the inflated margin narrower
 * than the gap. Every canvas would then be box tier — every tile and texture
 * released, the viewer blank until the reader happened to pan back out.
 *
 * Scoped to a centre within the world's own bounds, deliberately. A viewport
 * the world is nowhere near really must hold nothing: that is the nesting rule
 * ("a canvas leaving the pyramid tier releases everything, base level
 * included") and the thing that keeps an 800-folio manifest from holding 800
 * base tiles. The gutter is not that case — the reader is *in* the manifest,
 * between two of its pages.
 */
function residencyWindow(
    layout: LayoutRect[],
    viewport: Viewport,
    marginFactor: number,
): Set<string> {
    const visible = viewportBox(viewport);
    const margin = inflate(visible, marginFactor);
    const resident = new Set<string>();

    /** A canvas and the two the reader could turn to next. */
    function addWithNeighbours(index: number): void {
        // The neighbours by INDEX, not by distance: "the next page" is a
        // statement about reading order, and it stays correct in a
        // right-to-left or bottom-to-top world, where the next canvas is at a
        // lower coordinate rather than a higher one.
        for (const rect of [
            layout[index - 1],
            layout[index],
            layout[index + 1],
        ]) {
            if (rect) resident.add(rect.canvasId);
        }
    }

    layout.forEach((rect, index) => {
        if (intersects(rect, margin)) resident.add(rect.canvasId);
        if (intersects(rect, visible)) addWithNeighbours(index);
    });

    // A zero-area viewport is not "in the gutter" — it is a surface that has
    // not been measured yet, and it must not be given a reason to fetch.
    const inWorld =
        visible.width > 0 &&
        visible.height > 0 &&
        boxContains(worldBounds(layout) ?? EMPTY_BOX, viewport.centre);

    if (resident.size === 0 && inWorld) {
        // Nothing intersected, and the centre is inside the world: the
        // viewport is in a gutter between two canvases. The nearest canvas is
        // the one the reader is standing between, so it and its neighbours are
        // exactly what the window held one pixel either side.
        const nearest = nearestRect(layout, viewport.centre);
        if (nearest) addWithNeighbours(layout.indexOf(nearest));
    }

    return resident;
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
                draws.push({
                    key,
                    canvasId: canvas.id,
                    level: level.level,
                    ...tileBox,
                });
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
            draws.push({ key, canvasId: canvas.id, level: rung.index, ...box });
        }
    }
}

/**
 * A thumbnail's stable identity: the canvas, and the URL that was resolved for
 * it.
 *
 * Keyed on the **URL** rather than on the rung, deliberately. The declared-
 * thumbnail rung of the ladder returns one fixed URL whatever size was asked
 * for, so a rung-keyed identity would decode and hold the same picture once per
 * zoom step. Keyed on what is actually fetched, a zoom across the whole ladder
 * on such a canvas is one request and one texture.
 *
 * In the same namespace as `tilePyramid.tileKey`, which cannot collide with it:
 * that spelling puts a number where this puts `thumb`.
 */
function thumbnailKey(canvasId: string, url: string): TileKey {
    return `${canvasId}#thumb/${url}`;
}

/**
 * The largest rung at or below `wanted` whose image this canvas already holds,
 * or `wanted` when it holds none of them.
 *
 * Asked only while the view is MOVING, and it answers on its first probe in the
 * ordinary case — a canvas resident at the rung it wants costs one resolve and
 * one `Set` lookup, which is what it cost before. The walk only runs while a
 * gesture has carried the projection across a rung boundary and the new rung is
 * gated off, which is precisely the window in which the alternative is a blank
 * canvas.
 *
 * Bounded by {@link THUMBNAIL_RUNGS}, so it is at most five probes even in the
 * worst case, and it is a question about residency rather than about history:
 * the planner holds no per-canvas state between frames and this does not give
 * it any.
 */
function residentRungAtOrBelow(
    canvasId: string,
    wanted: number,
    resolveAt: (rung: number) => ThumbnailSource,
    residentTiles: ReadonlySet<TileKey>,
): number {
    for (let index = THUMBNAIL_RUNGS.indexOf(wanted); index >= 0; index -= 1) {
        const rung = THUMBNAIL_RUNGS[index];
        const resolved = resolveAt(rung);
        if (resolved.kind !== 'url') continue;
        if (residentTiles.has(thumbnailKey(canvasId, resolved.url)))
            return rung;
    }

    return wanted;
}

/**
 * The required set and the draw for one **thumbnail-tier** canvas: a single
 * small image, sized to its projection and quantized to a rung.
 *
 * Two entries, never more (see `thumbnailLadder.THUMBNAIL_BASE_RUNG`): the
 * cheapest rung, which is what paints while anything else is in flight, and the
 * rung the projection actually wants. At the derived zoom floor — where the
 * residency window can hold fifty canvases and every one of them is this tier —
 * they are the same rung and the same request.
 *
 * Returns the tier this canvas ends up in, which is `box` when the ladder ran
 * out: a canvas with no usable thumbnail renders as a plain rect rather than as
 * a broken image or a retry loop (user story 31).
 */
function planThumbnail(
    canvas: PlannerCanvas,
    rect: LayoutRect,
    viewport: Viewport,
    dpr: number,
    minPixelRatio: number,
    maxDecodedPixels: number,
    facts: ImageServiceFacts | undefined,
    viewStable: boolean,
    residentTiles: ReadonlySet<TileKey>,
    requests: ThumbnailRequest[],
    draws: TileDraw[],
    metadataRequests: string[],
    unresolved: string[],
): ResidencyTier {
    const resolveAt = (rung: number): ThumbnailSource =>
        resolveThumbnail({
            thumbnailUrl: canvas.thumbnailUrl,
            source: canvas.source,
            facts,
            rung,
            minPixelRatio,
            maxDecodedPixels,
            imageWidth: canvas.width,
        });

    // DEVICE pixels across, for the same reason level selection is measured in
    // them: the viewport is CSS pixels, and a thumbnail chosen from those is
    // visibly soft on a 2x screen.
    const projected = quantizeRung(rect.width * viewport.scale * dpr);
    // **The gesture freeze.** The view-stable gate below refuses NEW requests
    // during a gesture, and a rung that changes mid-pinch turns that refusal
    // into a blank canvas: the required set and the draws are both derived from
    // the current rungs, so the image already decoded at the previous rung is
    // in neither and the canvas paints its 32 px base stretched over 250 — or,
    // for a ladder whose base rung the cap refused, nothing at all. That is
    // exactly the "blanks the instant the reader touched it" failure the gate
    // exists to prevent, arriving through the rung rather than through the
    // gate. While the view is moving, the canvas therefore keeps painting the
    // largest rung it actually HOLDS, and picks the projection back up the
    // frame the motion stops.
    const wanted = viewStable
        ? projected
        : residentRungAtOrBelow(canvas.id, projected, resolveAt, residentTiles);

    const box: Box = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    };
    // One image covering the whole canvas, so there is nothing to intersect and
    // one priority for it: the distance from the viewport centre, which is what
    // makes the queue centre-out and the page the reader is looking at arrive
    // first.
    const priority = distanceToBox(viewport.centre, box);
    const visible = viewportBox(viewport);

    /** The rungs this canvas holds: the cheapest, then the one it wants. */
    const rungs =
        wanted === THUMBNAIL_BASE_RUNG
            ? [wanted]
            : [THUMBNAIL_BASE_RUNG, wanted];
    // At most two rungs, so "have I already asked for this URL?" is one
    // comparison rather than a `Set` allocated per canvas per frame — which on
    // an 800-folio manifest at the zoom floor is a few thousand a second for a
    // membership test over two elements.
    let previousKey: TileKey | null = null;
    let resolvedAny = false;
    let needsMetadata = false;

    rungs.forEach((rung, index) => {
        const resolved = resolveAt(rung);

        if (resolved.kind === 'metadata') {
            needsMetadata = true;
            return;
        }
        if (resolved.kind === 'none') return;

        resolvedAny = true;
        const key = thumbnailKey(canvas.id, resolved.url);
        // The declared-thumbnail rung resolves both rungs to one URL, and a
        // ladder can land two rungs on the same advertised image. Either way
        // that is one request, not two.
        if (key === previousKey) return;
        previousKey = key;

        // **The view-stable gate.** A thumbnail already decoded stays in the
        // required set through a gesture — dropping it would demote it to the
        // opportunistic cache and blank the canvas mid-drag — but nothing NEW
        // is asked for until the motion stops.
        if (viewStable || residentTiles.has(key)) {
            requests.push({
                key,
                canvasId: canvas.id,
                // The base rung paints under the chosen one, exactly as a
                // pyramid's coarse chain paints under its current level.
                level: index,
                url: resolved.url,
                priority,
                rung,
                ...(resolved.fallback ? { fallback: resolved.fallback } : {}),
            });
        }

        if (residentTiles.has(key) && intersects(box, visible)) {
            draws.push({ key, canvasId: canvas.id, level: index, ...box });
        }
    });

    if (needsMetadata && !resolvedAny) {
        // Gated with the thumbnails themselves, and bounded by the tier: this
        // is what keeps "fetch `info.json` to discover a thumbnail" from being
        // the fetch storm in a different costume.
        if (viewStable) metadataRequests.push(canvas.id);
        return 'thumbnail';
    }

    if (!resolvedAny) {
        unresolved.push(canvas.id);
        return 'box';
    }

    return 'thumbnail';
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
    // Idle unless the host says otherwise, which is what a test that does not
    // care about the gate — and a caller with nothing moving — is describing.
    const viewStable = input.viewStable ?? true;

    // The same function the host's per-sample clamping calls, so the world the
    // pan constraint is measured against can never diverge from the world that
    // is painted.
    const { layout, minZoom } = planViewportLimits(input);
    const rects = new Map(layout.map((rect) => [rect.canvasId, rect]));
    // Laid out, therefore plannable — and in layout's own order, so a canvas
    // dropped for having no usable geometry is absent from both.
    const layoutable = canvases.filter((canvas) => rects.has(canvas.id));
    // The virtualization gate. Everything outside it is box tier whatever its
    // projected size, which is what keeps the required set a function of the
    // VIEWPORT rather than of the manifest's length.
    const nearby = residencyWindow(layout, viewport, budgets.marginFactor);

    const tiers: Record<string, ResidencyTier> = {};
    const overCapCanvases: string[] = [];
    const metadataRequests: string[] = [];
    const tileRequests: TileRequest[] = [];
    const thumbnailRequests: ThumbnailRequest[] = [];
    const unresolvedThumbnails: string[] = [];
    const tileDraws: TileDraw[] = [];

    for (const canvas of layoutable) {
        const rect = rects.get(canvas.id)!;
        // Position first, size second. A canvas the viewport is nowhere near
        // holds nothing however large it would project — see `residencyWindow`
        // for why the size test alone cannot express that.
        const tier = nearby.has(canvas.id)
            ? assignTier(
                  rect,
                  viewport.scale,
                  budgets.pyramidThreshold,
                  budgets.boxThreshold,
              )
            : 'box';
        // A box-tier canvas holds no network resource and no texture, so
        // whatever it held is droppable — which the tier map already says.
        // There is deliberately no second `evictable` list beside it: one
        // residency vocabulary, and nothing allocating ~795 canvas ids a frame
        // for a reader that does not exist.
        tiers[canvas.id] = tier;

        // A static-image source has exactly one known URL and no service, so it
        // has nothing to discover and nothing to tile (user story 29). Its
        // thumbnail tier is its one image, painted by the host, which is why
        // the ladder below is not asked about it either.
        if (canvas.source.kind !== 'service') continue;

        // One small image instead of a pyramid — the tier that fills the grey
        // boxes. It can send the canvas to the box tier (nothing usable), so
        // the tier map is written from what it decides.
        if (tier === 'thumbnail') {
            tiers[canvas.id] = planThumbnail(
                canvas,
                rect,
                viewport,
                dpr,
                budgets.minPixelRatio,
                budgets.maxDecodedPixels,
                knownMetadata[canvas.id],
                viewStable,
                residentTiles,
                thumbnailRequests,
                tileDraws,
                metadataRequests,
                unresolvedThumbnails,
            );
            continue;
        }

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
            // per canvas before anything renders — and only once the view has
            // stopped moving, so a flick past a hundred folios asks for none of
            // them (spec §Tile scheduling).
            if (viewStable) metadataRequests.push(canvas.id);
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
        // Centre-out, exactly like the tiles they share a scheduler and a
        // concurrency cap with, so what the reader is looking at arrives first.
        thumbnailRequests: thumbnailRequests.sort(
            (a, b) => a.priority - b.priority || a.level - b.level,
        ),
        metadataRequests,
        unresolvedThumbnails,
        overCapCanvases,
        minZoom,
    };
}
