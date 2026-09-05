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
 * exist and the renderer's decisions would lose their unit tests.
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
 * It also has a **floor** (`tierFloor` below): the canvas nearest the viewport
 * centre and its two neighbours never fall below this tier, however far out the
 * reader has zoomed. Projected size goes to zero, so without it there is a scale
 * past which every canvas is box tier and the viewer paints nothing at all.
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
    DURATION_ONLY_CANVAS_PLACEHOLDER,
    UNSIZED_CANVAS_PLACEHOLDER,
} from './rendererDefaults';
import { viewportBox } from './viewportMath';
import {
    boxContains,
    distanceToBox,
    nearestRect,
    worldBounds,
} from './layoutQueries';
import {
    buildSizeLadder,
    chooseRung,
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
    tileFallback,
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
    PlannerImage,
    PlanSceneInput,
    PlanWorldInput,
    ResidencyTier,
    ScenePlan,
    SourceDescriptor,
    StaticImageDraw,
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

/**
 * Whether a canvas can be planned at all: it can be named.
 *
 * An invariant `canvasDescriptors.toPlannerCanvas` already guarantees, and
 * re-checked here because the planner is a pure function with a public input
 * type, so nothing stops a caller (or a test) handing it a nameless one.
 *
 * It used to demand a picture as well. A canvas whose painting bodies are all
 * non-image has none and must still be laid out — it keeps its rect, its tier,
 * and its place in navigation, and the host paints the **unsupported
 * presentation** over it (CONTEXT.md). So every `canvas.images[0]` read below
 * is guarded instead.
 */
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

/** The aspect ratio of a box, or null when it has none. */
function aspectOf(box: { width: number; height: number } | null) {
    return box && isUsableDimension(box.width) && isUsableDimension(box.height)
        ? box.height / box.width
        : null;
}

/**
 * The box a canvas takes when neither the manifest, a service, nor a sibling
 * offers one — the geometry of last resort, chosen on the only thing known about
 * the canvas at that point: whether it has a picture at all.
 *
 * A canvas with a duration and no images is an audio recording (a Sound body is
 * required to state a duration and forbidden to state dimensions), and nothing
 * will ever paint a picture in its rect: no service to reflow from, no companion
 * Canvas — one of those would have donated a rect before the descriptor reached
 * this function (`companionCanvases.withCompanion`) — so a page-shaped box would
 * be a page-shaped nothing. It gets a strip instead, which is the shape of the
 * timeline that is the only thing an AV plugin will put there.
 *
 * A canvas that omits its dimensions and declares no duration is the ordinary
 * spec violation of user story 32: a picture whose shape is unknown, and a
 * fetch may yet report it.
 */
function placeholderBox(canvas: PlannerCanvas): {
    width: number;
    height: number;
} {
    return canvas.images.length === 0 && isUsableDimension(canvas.duration)
        ? DURATION_ONLY_CANVAS_PLACEHOLDER
        : UNSIZED_CANVAS_PLACEHOLDER;
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
 * 4. **Failing even that, a placeholder** — {@link placeholderBox}. The rung
 *    that makes the drop unreachable, and it is reachable itself on the path
 *    users actually take: in individuals and continuous mode the host feeds ONE
 *    canvas, so an unsized canvas there has no siblings to take a median from.
 *    It is also the whole of a bare audio manifest's geometry, which is why the
 *    box is shaped by what the canvas turns out to be rather than being one
 *    constant.
 *
 * Only a canvas with no usable id is dropped: it cannot be keyed, so nothing
 * downstream could name it.
 */
/**
 * The image-service facts for one placed image.
 *
 * Keyed on the service rather than on the canvas, because a canvas id is not a
 * stable name for a picture: selecting a different Choice resolves the same
 * canvas to a different service, and a canvas-keyed record answers for the
 * previous alternative — which both feeds the wrong dimensions into
 * {@link buildPyramid} and, because the answer is non-empty, stops the new
 * service's `info.json` from ever being asked for. A composite canvas makes the
 * same point twice over: its folio and its miniature are two services, and one
 * record per canvas could only ever describe one of them. Facts belong to a
 * service anyway: this record is a view onto a service-keyed cache
 * (`imageService.imageServiceCache`), and keying it this way is what makes the
 * two agree.
 *
 * `undefined` for a static source, which has no service and therefore no facts —
 * the same answer an image whose `info.json` has not landed yet gets.
 */
function factsFor(
    source: SourceDescriptor,
    knownMetadata: Record<string, ImageServiceFacts>,
): ImageServiceFacts | undefined {
    return source.kind === 'service'
        ? knownMetadata[source.serviceId]
        : undefined;
}

/**
 * The canvas-space box one placed image paints into.
 *
 * {@link PlannerImage} placement is normalized by the Canvas's own width on
 * both axes, so every component scales by the laid-out box's WIDTH — the
 * vertical ones included. Using `rect.height` for the vertical axis is the
 * natural-looking mistake and it is wrong: it would rescale the placement by
 * the canvas's aspect ratio, putting a miniature at the right height only on a
 * square canvas.
 *
 * There is deliberately no shortcut for the canvas-filling case. `x: 0, y: 0,
 * width: 1` looks like it identifies one — the overwhelmingly common single
 * annotation targeting its whole canvas — and it does not: an annotation
 * targeting `#xywh=0,0,1200,900` on a 1200x1800 canvas has exactly those three
 * values and paints the TOP HALF. Only `height` tells the two apart, and it
 * tells them apart by comparing two independently computed ratios for float
 * equality. The general arithmetic is correct for both and costs four
 * multiplications.
 */
function canvasBox(rect: LayoutRect): Box {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function placeImage(rect: LayoutRect, image: PlannerImage): Box {
    return {
        x: rect.x + image.x * rect.width,
        y: rect.y + image.y * rect.width,
        width: image.width * rect.width,
        height: image.height * rect.width,
    };
}

function resolveGeometry(
    canvases: PlannerCanvas[],
    knownMetadata: Record<string, ImageServiceFacts>,
): SizedCanvas[] {
    const usable = canvases.filter(hasUsableId);

    const declared = usable.filter(
        (canvas) =>
            isUsableDimension(canvas.width) && isUsableDimension(canvas.height),
    );
    // `null` where no sibling declared both axes and there is nothing to take a
    // median of. The last rung is then per canvas rather than one box for the
    // whole world, so a duration-only canvas is not shaped like a page.
    const guess =
        declared.length > 0
            ? {
                  width: median(declared.map((canvas) => canvas.width!)),
                  height: median(declared.map((canvas) => canvas.height!)),
              }
            : null;

    return usable.map((canvas): SizedCanvas => {
        // The PRIMARY image's service, and only it, can reflow the canvas. The
        // reflow answers "how big is this page?" for a canvas whose manifest
        // never said, and the first painting annotation is the one that covers
        // it; a miniature painted into a corner describes its own rectangle and
        // reshaping the folio to match it would be nonsense.
        //
        // A canvas with no image has nothing that could report a size, so it
        // takes the sibling median — which is the whole of the duration-only
        // audio canvas's geometry.
        const facts = canvas.images.length
            ? factsFor(canvas.images[0].source, knownMetadata)
            : null;
        const reported =
            facts &&
            isUsableDimension(facts.width) &&
            isUsableDimension(facts.height)
                ? { width: facts.width, height: facts.height }
                : null;
        const fallback = reported ?? guess ?? placeholderBox(canvas);

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
 * O(n) requests to open, which the residency window exists to prevent.
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
 * The canvases whose tier may never fall to `box`, however far out the reader
 * has zoomed: the one nearest the viewport centre, and the two either side of it
 * in reading order.
 *
 * **A scene is never entirely box tier**, and — exactly like the gutter rule in
 * {@link residencyWindow} — that is a rule rather than a consequence of the
 * arithmetic above it. The box tier is decided from projected size alone, and
 * projected size goes to zero: past some scale EVERY canvas is below
 * `boxThreshold`, every one of them releases its texture, and the viewer is the
 * faint grey placeholder rects and nothing else. The derived zoom floor
 * ({@link deriveMinZoom}) does not save it, because the floor is derived from
 * the very same threshold — it is the scale at which the MEDIAN canvas reaches
 * `boxThreshold`, so the two land on the same boundary and which side the
 * comparison falls on is a rounding accident. A canvas narrower than the median,
 * or a scale reached by a programmatic `setView` rather than through the clamp,
 * is over the edge outright.
 *
 * Nothing about a zoom level is a reason to stop rendering. Zoom bounds are a
 * SETTING, still to come; until they exist, zooming out further must degrade the
 * picture, never extinguish it.
 *
 * Bounded to three canvases, and that bound is what makes this affordable. The
 * reason the box tier exists is that a size-only gate hands all 800 folios of a
 * long manifest a texture at once, and at extreme zoom-out all 800 of them are
 * on screen — so "keep painting whatever is visible" is the same fetch storm
 * the residency window exists to prevent, in a different costume. Three
 * thumbnails at the base rung is ~6 KB, it is the page the reader is actually
 * centred on plus the two they
 * could turn to, and the other 797 keep their placeholder rects.
 *
 * Restricted to `nearby` so the scoping matches: a viewport the world is nowhere
 * near holds nothing, and this does not give it a reason to hold something.
 */
function tierFloor(
    layout: LayoutRect[],
    viewport: Viewport,
    nearby: ReadonlySet<string>,
): Set<string> {
    const floor = new Set<string>();
    const nearest =
        nearby.size > 0 ? nearestRect(layout, viewport.centre) : null;
    if (!nearest) return floor;

    const index = layout.indexOf(nearest);
    for (const rect of [layout[index - 1], layout[index], layout[index + 1]]) {
        if (rect && nearby.has(rect.canvasId)) floor.add(rect.canvasId);
    }

    return floor;
}

/**
 * The required set and the draw list for one placed image on a pyramid-tier
 * canvas.
 *
 * `box` is the image's own box, not the canvas's — the two differ whenever a
 * painting annotation targets a sub-rectangle — and everything below is
 * measured against it: the level is chosen from how big THIS image is on
 * screen, and its tiles tile THIS rectangle. A miniature covering a fifteenth
 * of a folio therefore settles on a much coarser level than the folio it sits
 * on, which is both correct and the reason the tier can stay a per-canvas
 * decision.
 *
 * Priority is the canvas-space distance from the viewport centre to the tile —
 * distance, not discovery order, and not rank. Coarser levels break ties, so
 * blur-up coverage lands ahead of the detail that will replace it while the
 * ordering stays centre-out.
 */
function planPyramid(
    canvasId: string,
    pyramid: TilePyramid,
    box: Box,
    order: number,
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
    const imageScale = (viewport.scale * dpr * box.width) / pyramid.width;
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
        const within = level.level === 0 ? null : margin;

        for (const { column, row } of tilesIntersecting(
            pyramid,
            level,
            box,
            within,
        )) {
            const key = tileKey(
                canvasId,
                pyramid.serviceId,
                level.level,
                column,
                row,
            );
            const tileBox = tileCanvasRect(pyramid, level, column, row, box);
            const fallback = tileFallback(pyramid, level, column, row);

            requests.push({
                key,
                canvasId,
                level: level.level,
                url: tileUrl(pyramid, level, column, row),
                priority: distanceToBox(viewport.centre, tileBox),
                ...(fallback ? { fallback } : {}),
            });

            // Drawn only if held AND actually on screen: the margin exists to
            // prefetch, not to paint.
            if (residentTiles.has(key) && intersects(tileBox, visible)) {
                draws.push({
                    key,
                    canvasId,
                    level: level.level,
                    order,
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
    canvasId: string,
    ladder: SizeLadder,
    box: Box,
    order: number,
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
    const imageScale = (viewport.scale * dpr * box.width) / ladder.width;
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

        const key = tileKey(canvasId, ladder.serviceId, rung.index, 0, 0);
        const fallback = rungFallback(ladder, rung);

        requests.push({
            key,
            canvasId,
            level: rung.index,
            url: rungUrl(ladder, rung),
            priority,
            ...(fallback ? { fallback } : {}),
        });

        if (residentTiles.has(key) && intersects(box, visible)) {
            draws.push({ key, canvasId, level: rung.index, order, ...box });
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
 * What one thumbnail resolution came to, for the caller to aggregate over a
 * canvas's placed images.
 *
 * Three outcomes rather than a tier, because a composite canvas can have one
 * image resolve, one still waiting on `info.json`, and one with nothing usable
 * at all — and the canvas's tier, its `info.json` request, and its
 * `unresolvedThumbnails` entry are each a statement about the CANVAS, decided
 * from all three. Reported upwards rather than written here for that reason:
 * pushed per image, `metadataRequests` would carry one entry per painting
 * annotation and `unresolvedThumbnails` would report a canvas that is painting
 * perfectly well from its other half.
 */
type ThumbnailOutcome = 'painted' | 'pending' | 'unresolved';

/**
 * How good an outcome is, so a canvas can be summarized by its best image.
 *
 * "Best", not "worst", because each outcome is a claim about whether the canvas
 * has anything to show: one picture painting is enough for the canvas not to be
 * blank, and one still waiting on `info.json` is enough for the canvas not to be
 * declared permanently unresolvable.
 */
const OUTCOME_RANK: Record<ThumbnailOutcome, number> = {
    unresolved: 0,
    pending: 1,
    painted: 2,
};

function betterOutcome(
    a: ThumbnailOutcome,
    b: ThumbnailOutcome,
): ThumbnailOutcome {
    return OUTCOME_RANK[b] > OUTCOME_RANK[a] ? b : a;
}

/**
 * The required set and the draw for one **thumbnail-tier** placed image: a
 * single small image, sized to its projection and quantized to a rung.
 *
 * Two entries, never more (see `thumbnailLadder.THUMBNAIL_BASE_RUNG`): the
 * cheapest rung, which is what paints while anything else is in flight, and the
 * rung the projection actually wants. At the derived zoom floor — where the
 * residency window can hold fifty canvases and every one of them is this tier —
 * they are the same rung and the same request.
 *
 * `box` is the image's own box and `imageWidth` its own extent, so a
 * region-targeted image asks for a thumbnail sized to the rectangle it actually
 * paints rather than to the whole folio. On the ordinary canvas-filling image
 * both are the canvas's, which is what they have always been.
 */
function planThumbnail(
    canvasId: string,
    thumbnailUrl: string | null | undefined,
    source: SourceDescriptor,
    imageWidth: number | null,
    box: Box,
    order: number,
    viewport: Viewport,
    dpr: number,
    minPixelRatio: number,
    maxDecodedPixels: number,
    facts: ImageServiceFacts | undefined,
    viewStable: boolean,
    residentTiles: ReadonlySet<TileKey>,
    requests: ThumbnailRequest[],
    draws: TileDraw[],
): ThumbnailOutcome {
    const resolveAt = (rung: number): ThumbnailSource =>
        resolveThumbnail({
            thumbnailUrl,
            source,
            facts,
            rung,
            minPixelRatio,
            maxDecodedPixels,
            imageWidth,
        });

    // DEVICE pixels across, for the same reason level selection is measured in
    // them: the viewport is CSS pixels, and a thumbnail chosen from those is
    // visibly soft on a 2x screen.
    const projected = quantizeRung(box.width * viewport.scale * dpr);
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
        : residentRungAtOrBelow(canvasId, projected, resolveAt, residentTiles);

    // One image covering the whole box, so there is nothing to intersect and
    // one priority for it: the distance from the viewport centre, which is what
    // makes the queue centre-out and the page the reader is looking at arrive
    // first.
    const priority = distanceToBox(viewport.centre, box);
    const visible = viewportBox(viewport);

    /** The rungs this image holds: the cheapest, then the one it wants. */
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
        const key = thumbnailKey(canvasId, resolved.url);
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
                canvasId,
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
            draws.push({ key, canvasId, level: index, order, ...box });
        }
    });

    if (resolvedAny) return 'painted';
    // Nothing yet, but an `info.json` would decide it. The caller gates the
    // request on a stable view and asks once per canvas, which is what keeps
    // "fetch `info.json` to discover a thumbnail" from being the fetch storm in
    // a different costume.
    if (needsMetadata) return 'pending';
    // The ladder ran out: no usable thumbnail exists, ever. Never a request, so
    // never a retry (user story 31).
    return 'unresolved';
}

/**
 * Keep the pyramid's **base level** on a thumbnail-tier canvas that has nothing
 * else to paint.
 *
 * ## The blank second this removes
 *
 * Blur-up holds *within* the pyramid tier — an incomplete level paints over the
 * coarse chain — and it held nowhere at the boundary out of it. Crossing
 * `pyramidThreshold` released every tile the canvas had (the nesting rule, one
 * tier up in `planScene`) while the thumbnail that replaces them had not been
 * asked for yet, let alone answered. Tiles and thumbnails are two key namespaces,
 * so the required set went from "eleven tiles" to "one thumbnail nobody holds"
 * between two frames, and `tileDraws` — the resident subset — went empty.
 *
 * On a fixture service that is a flicker. On a real IIIF endpoint it is a round
 * trip: the reader zooms out one notch, the page vanishes for the better part of
 * a second, and then reappears soft. That is the single most visible defect in
 * the renderer and it is invisible to a test whose service answers instantly.
 *
 * ## Why the base level is the right thing to keep
 *
 * It covers the whole image, it is already decoded — the canvas held it a frame
 * ago, because the base level is required WHOLE at every pyramid level — and it
 * is the same picture a thumbnail is, at a comparable resolution. So the
 * handover costs no network at all and the reader sees the page soften rather
 * than disappear.
 *
 * **The whole level, not tile (0,0).** A pyramid's coarsest level is a single
 * tile only where the renderer derived the scale-factor chain itself. A
 * service's declared `scaleFactors` are taken as given, and a chain that stops
 * short — `[1,2,4]` on a 4000px scan, `[1,2,4,8]` on a 4613px one — leaves a
 * base level two tiles across, which is ordinary on real endpoints rather than
 * an edge case. Tile (0,0) alone would paint a quarter of the folio into the
 * whole box, so the level is carried whole.
 *
 * Where the thumbnail never arrives at all this is the difference between a
 * softer picture and no picture: a level0 tile tree that holds no whole-image
 * derivative answers the ladder's request with a 404, so a canvas of that shape
 * has nothing but the carried level for as long as the reader stays zoomed out.
 *
 * ## Why this is not "the base level is never evicted"
 *
 * That reading would mean 800 resident base tiles on an 800-folio manifest, which
 * is what the tier gate exists to prevent. Two conditions keep this bounded to
 * the handover it is named for:
 *
 * - **Only base tiles the canvas ALREADY HOLDS.** A canvas arriving from the box
 *   tier holds nothing, so it carries nothing and costs nothing — it shows its
 *   placeholder and then its thumbnail, exactly as before. Only a canvas on its
 *   way DOWN from the pyramid tier can satisfy this, and there are never more of
 *   those than were in the pyramid tier a moment ago. A canvas holding part of
 *   its base level carries that part and fetches nothing for the rest: three
 *   quarters of a folio is blur-up, and the whole point is that it costs no
 *   network.
 * - **Only while the thumbnail is missing.** The caller asks only when
 *   `planThumbnail` produced no draw. The frame the thumbnail lands, this stops
 *   being reached, the base tile leaves the required set, and it is released
 *   through the ordinary opportunistic cache.
 *
 * The residency probe is a bare `Set` lookup on a key built without the pyramid,
 * so the pyramid is only built for a canvas that genuinely holds its base level:
 * on an 800-folio manifest at the zoom floor, none of them. Tile (0,0) is the
 * one probed because it is present at every base level whatever its extent.
 */
function carryBaseLevel(
    canvasId: string,
    source: SourceDescriptor,
    box: Box,
    order: number,
    facts: ImageServiceFacts | undefined,
    residentTiles: ReadonlySet<TileKey>,
    requests: TileRequest[],
    draws: TileDraw[],
): void {
    if (!facts || source.kind !== 'service') return;

    // Probed before anything is built, because this is the test that is false
    // for every canvas but the one or two mid-handover.
    if (
        !residentTiles.has(tileKey(canvasId, baseUri(source, facts), 0, 0, 0))
    ) {
        return;
    }

    // Everything below pushes to `requests` as well as to `draws`, because
    // `tileDraws` is the required-AND-held subset: a carried tile left out of the
    // request list would be demoted to the opportunistic cache and could not be
    // painted — the blank frame again, arriving through eviction instead of
    // through the tier.
    const pyramid = buildPyramid(source.serviceId, facts);
    if (!pyramid) {
        // A size-ladder source, whose base rung is one whole image by
        // construction — there is no grid to walk.
        const request = baseLevelTile(canvasId, source, facts, 0);
        if (!request) return;

        requests.push(request);
        draws.push({ key: request.key, canvasId, level: 0, order, ...box });
        return;
    }

    const level = pyramid.levels[0];
    // `null` for the whole level, exactly as `planPyramid` asks for it: the
    // canvas held the level whole a frame ago, and half of it is a half-drawn
    // folio.
    for (const { column, row } of tilesIntersecting(
        pyramid,
        level,
        box,
        null,
    )) {
        const key = tileKey(canvasId, pyramid.serviceId, 0, column, row);
        if (!residentTiles.has(key)) continue;

        const fallback = tileFallback(pyramid, level, column, row);
        requests.push({
            key,
            canvasId,
            level: 0,
            url: tileUrl(pyramid, level, column, row),
            priority: 0,
            ...(fallback ? { fallback } : {}),
        });
        draws.push({
            key,
            canvasId,
            level: 0,
            order,
            ...tileCanvasRect(pyramid, level, column, row, box),
        });
    }
}

/**
 * The base URI for a service's image requests, which is the identity every
 * planner keys its tiles by.
 *
 * `info.json` owns it and it can differ from the id the manifest advertised — a
 * trailing slash, an http→https redirect, or an auth gateway signing access.
 * Keying a request one way and drawing it the other produces a tile nothing
 * ever asks for, so this is the single spelling of that choice
 * (`tilePyramid.buildPyramid` and `sizeLadder.buildSizeLadder` make the same
 * one).
 */
function baseUri(
    source: { serviceId: string },
    facts: ImageServiceFacts,
): string {
    return facts.requestBaseUri ?? source.serviceId;
}

/**
 * One service's **base level** as a tile request: level 0, tile (0,0) — but
 * only where that one request is the whole picture.
 *
 * A pyramid's coarsest level is a single tile whenever the renderer derived the
 * scale-factor chain itself, and need not be when the service declared
 * `scaleFactors`: factors are taken as given, so `[1,2,4]` on a 10000 px image
 * with 512 px tiles leaves five columns at the coarsest level and tile (0,0) is
 * a corner. A size ladder's base rung is always whole, but on a level0 master
 * with no advertised `sizes` it is the full-resolution scan. `null` for both,
 * and for a service with no facts, no pyramid and no ladder.
 *
 * `fallbackTileSize` is passed through to {@link buildPyramid} for the level 1/2
 * service that omits `tiles`; `maxDecodedPixels` refuses a base image bigger
 * than one decode may be.
 */
function baseLevelTile(
    canvasId: string,
    source: SourceDescriptor,
    facts: ImageServiceFacts | undefined,
    priority: number,
    fallbackTileSize?: number,
    maxDecodedPixels = Infinity,
): TileRequest | null {
    if (!facts || source.kind !== 'service') return null;

    const pyramid = buildPyramid(source.serviceId, facts, fallbackTileSize);
    const ladder =
        !pyramid && isSizeLadderSource(facts, source.profile)
            ? buildSizeLadder(source.serviceId, facts)
            : null;

    let url: string;
    let fallback: { url: string; group: string } | null = null;

    if (pyramid) {
        const level = pyramid.levels[0];
        if (level.columns !== 1 || level.rows !== 1) return null;
        if (level.width * level.height > maxDecodedPixels) return null;
        url = tileUrl(pyramid, level, 0, 0);
        fallback = tileFallback(pyramid, level, 0, 0);
    } else if (ladder) {
        const rung = ladder.rungs[0];
        if (rung.width * rung.height > maxDecodedPixels) return null;
        url = rungUrl(ladder, rung);
        fallback = rungFallback(ladder, rung);
    } else {
        return null;
    }

    return {
        key: tileKey(canvasId, baseUri(source, facts), 0, 0, 0),
        canvasId,
        level: 0,
        url,
        priority,
        ...(fallback ? { fallback } : {}),
    };
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
    // Lazy, because the scan behind it costs O(manifest) and can only ever
    // matter on a frame where a NEARBY canvas came out box tier — which is the
    // zoomed-out case and nothing else. At reading zoom every member of the
    // residency window projects large, so this is never built.
    let floor: Set<string> | null = null;
    const flooredTier = (canvasId: string): ResidencyTier =>
        (floor ??= tierFloor(layout, viewport, nearby)).has(canvasId)
            ? 'thumbnail'
            : 'box';

    const tiers: Record<string, ResidencyTier> = {};
    const metadataRequests: string[] = [];
    const tileRequests: TileRequest[] = [];
    const thumbnailRequests: ThumbnailRequest[] = [];
    const unresolvedThumbnails: string[] = [];
    const tileDraws: TileDraw[] = [];
    const staticImages: StaticImageDraw[] = [];
    // The plan-wide paint-order counter. Incremented per PLACED IMAGE, in
    // canvas order and then annotation order, so a draw's `order` says where
    // its picture sits in the sequence the painter must honour.
    let paintOrder = 0;

    for (const canvas of layoutable) {
        const rect = rects.get(canvas.id)!;
        // Position first, size second. A canvas the viewport is nowhere near
        // holds nothing however large it would project — see `residencyWindow`
        // for why the size test alone cannot express that.
        let tier: ResidencyTier = 'box';
        if (nearby.has(canvas.id)) {
            tier = assignTier(
                rect,
                viewport.scale,
                budgets.pyramidThreshold,
                budgets.boxThreshold,
            );
            // ...and the tier floor last. Projected size goes to zero, so past
            // some scale the size test puts EVERY canvas in the box tier and the
            // viewer holds nothing at all; `tierFloor` is what keeps the page the
            // reader is centred on rendering however far out they have zoomed.
            if (tier === 'box') tier = flooredTier(canvas.id);
        }
        // A box-tier canvas holds no network resource and no texture, so
        // whatever it held is droppable — which the tier map already says.
        // There is deliberately no second `evictable` list beside it: one
        // residency vocabulary, and nothing allocating ~795 canvas ids a frame
        // for a reader that does not exist.
        tiers[canvas.id] = tier;

        // A box-tier canvas holds nothing at all, so there is nothing per-image
        // to decide for it.
        if (tier === 'box') continue;

        // Asked at most ONCE per canvas, however many services it paints from.
        // The host fetches every service on the canvas it is handed, and the
        // list is re-emitted every frame until the facts land — so a per-image
        // push would put one entry per painting annotation into a list walked
        // sixty times a second, for one answer.
        //
        // Gated on a stable view wherever it is called from: a flick passes over
        // hundreds of canvases that are never dwelt on, and asking for each one
        // as it goes by is most of the request storm on its own (spec §Tile
        // scheduling).
        let askedForMetadata = false;
        function askForMetadata(): void {
            if (!viewStable || askedForMetadata) return;
            askedForMetadata = true;
            metadataRequests.push(canvas.id);
        }

        // **The companion the phase is about to name** (`PlannerCanvas.warmImages`),
        // made requestable without being painted.
        //
        // ONE request per warmed picture, and the cheapest one that shows the
        // whole of it: the base level where that is a single tile covering the
        // image, and otherwise the base rung of the thumbnail ladder. Either is
        // a picture the handover can paint in the frame it happens — the tier
        // that takes over draws whichever it finds resident — while the ladder
        // above it is left to climb on demand, so a companion nobody is looking
        // at yet never costs a reader more than a thumbnail (user stories 41 and
        // 42). A picture with no such cheap whole view — a level0 master with no
        // derivatives — is simply not warmed, which is the same answer the
        // thumbnail tier gives it.
        //
        // Nothing is pushed to `tileDraws`: the phase decides what paints, and
        // it has not named this companion.
        //
        // Services only. A **static-image** companion has no ladder to warm a
        // rung of and reaches the host as an `<img>` it paints on sight, so the
        // only way to make one resident is to draw it — which is the phase's
        // decision and not this block's.
        //
        // Ahead of the empty-`images` guard below, because the canvas that
        // paints nothing at all is the one whose handover has the longest way
        // to come.
        const warmTileMark = tileRequests.length;
        const warmThumbnailMark = thumbnailRequests.length;

        for (const image of canvas.warmImages ?? []) {
            if (image.source.kind !== 'service') continue;
            const facts = factsFor(image.source, knownMetadata);
            if (!facts) {
                askForMetadata();
                continue;
            }

            // Last in the centre-out queue, behind every tile of the picture
            // the reader is actually looking at. Kept in the required set even
            // while the view moves, unlike a new thumbnail: demoting it to the
            // opportunistic cache mid-drag would lose the one thing the
            // handover is waiting on.
            const priority = Number.MAX_SAFE_INTEGER;
            const warm = baseLevelTile(
                canvas.id,
                image.source,
                facts,
                priority,
                // The same grid the pyramid tier derives for a level 1/2
                // service that omits `tiles`, so the warmed key is the key that
                // tier will draw.
                DERIVED_TILE_SIZE,
                budgets.maxDecodedPixels,
            );
            if (warm) {
                tileRequests.push(warm);
                continue;
            }

            // The base rung, which is the one rung `planThumbnail` asks for at
            // every projection: warming it is warming a request the reader's own
            // thumbnail tier makes anyway, and it is keyed the way that tier
            // keys it.
            const resolved = resolveThumbnail({
                source: image.source,
                facts,
                rung: THUMBNAIL_BASE_RUNG,
                minPixelRatio: budgets.minPixelRatio,
                maxDecodedPixels: budgets.maxDecodedPixels,
                imageWidth:
                    canvas.width === null ? null : image.width * canvas.width,
            });
            if (resolved.kind !== 'url') continue;

            thumbnailRequests.push({
                key: thumbnailKey(canvas.id, resolved.url),
                canvasId: canvas.id,
                level: 0,
                url: resolved.url,
                priority,
                rung: THUMBNAIL_BASE_RUNG,
                ...(resolved.fallback ? { fallback: resolved.fallback } : {}),
            });
        }

        const warmTiles = tileRequests.length - warmTileMark;
        const warmThumbnails = thumbnailRequests.length - warmThumbnailMark;

        // Neither does a canvas with no image on it — the **unsupported
        // presentation**'s canvas. There is no source to ask for tiles, a
        // thumbnail, or `info.json`, and reporting it in `unresolvedThumbnails`
        // would log a resolution failure for something nobody tried to resolve.
        // It keeps its rect and its tier; the host draws the placeholder over
        // them.
        if (canvas.images.length === 0) continue;

        // **Where composition happens.** Each painting annotation paints into
        // its own box, and everything below is planned against that box rather
        // than against the canvas's: a miniature targeting `#xywh=` gets its
        // own tiles, its own level, and its own thumbnail, sized to the
        // rectangle it actually covers.
        //
        // `order` is this placement's index in the plan's paint order, which is
        // what lets the painter interleave whole images with tiles: a canvas can
        // compose a tiled folio with a plain-JPEG overlay, and the two arrive in
        // separate lists.
        const placements = canvas.images.map((image, index) => ({
            image,
            box: placeImage(rect, image),
            order: paintOrder + index,
        }));
        paintOrder += placements.length;

        // A static-image source has exactly one known URL and no service, so it
        // has nothing to discover and nothing to tile (user story 29). It is
        // fetched and painted whole by the host at every tier above `box`,
        // which is why the ladder below is never asked about it.
        for (const { image, box, order } of placements) {
            if (image.source.kind !== 'static') continue;
            staticImages.push({
                key: image.key,
                canvasId: canvas.id,
                url: image.source.url,
                order,
                ...box,
            });
        }

        // One small image instead of a pyramid — the tier that fills the grey
        // boxes. It can send the canvas to the box tier (nothing usable), so
        // the tier map is written from what it decides.
        if (tier === 'thumbnail') {
            // A Canvas-declared `thumbnail` depicts the FINISHED canvas,
            // miniature and all, so it is one request painted over the whole
            // canvas box — exactly what this tier did before a canvas could
            // compose. Only where the manifest declares none does the tier fall
            // back to each placed image's own service ladder, in the image's own
            // box: the alternative is squeezing a whole-canvas picture into a
            // miniature's rectangle, or asking each half of a composite canvas
            // for a picture of the whole.
            const slots = canvas.thumbnailUrl
                ? [
                      {
                          thumbnailUrl: canvas.thumbnailUrl,
                          order: placements[0].order,
                          // Unread on this branch — the declared URL is used
                          // as-is at every rung, with no service consulted — and
                          // supplied because the resolver takes a source.
                          source: canvas.images[0].source,
                          imageWidth: canvas.width,
                          box: canvasBox(rect),
                      },
                  ]
                : placements
                      .filter(({ image }) => image.source.kind === 'service')
                      .map(({ image, box, order }) => ({
                          thumbnailUrl: null,
                          order,
                          source: image.source,
                          // The image's own extent in canvas units, which is all
                          // this is for: it keeps a constructed `{w},` from
                          // exceeding the picture and 400-ing. Placement is
                          // normalized by the Canvas's width, so a canvas-filling
                          // image gives the Canvas width back — what it has
                          // always been — and a region-targeted one gives its
                          // target's width.
                          imageWidth:
                              canvas.width === null
                                  ? null
                                  : image.width * canvas.width,
                          box,
                      }));

            // A static image is already painting at this tier, so the canvas is
            // not blank whatever the ladder decides for its other halves.
            let outcome: ThumbnailOutcome = placements.some(
                ({ image }) => image.source.kind === 'static',
            )
                ? 'painted'
                : 'unresolved';

            for (const slot of slots) {
                const facts = factsFor(slot.source, knownMetadata);
                const drawsBefore = tileDraws.length;

                const resolved = planThumbnail(
                    canvas.id,
                    slot.thumbnailUrl,
                    slot.source,
                    slot.imageWidth,
                    slot.box,
                    slot.order,
                    viewport,
                    dpr,
                    budgets.minPixelRatio,
                    budgets.maxDecodedPixels,
                    facts,
                    viewStable,
                    residentTiles,
                    thumbnailRequests,
                    tileDraws,
                );
                if (resolved === 'pending') askForMetadata();
                outcome = betterOutcome(outcome, resolved);

                // Nothing to paint yet, so this image keeps whatever the
                // PYRAMID left it until its thumbnail lands. See
                // `carryBaseLevel`.
                if (tileDraws.length === drawsBefore) {
                    carryBaseLevel(
                        canvas.id,
                        slot.source,
                        slot.box,
                        slot.order,
                        facts,
                        residentTiles,
                        tileRequests,
                        tileDraws,
                    );
                }
            }

            // Reported per CANVAS, and only when every picture on it came up
            // empty: a composite canvas whose miniature has no usable thumbnail
            // still paints its folio, and calling that canvas unresolved would
            // both mislead the log and demote a canvas that is rendering.
            if (outcome === 'unresolved') {
                unresolvedThumbnails.push(canvas.id);
                tiers[canvas.id] = 'box';
                // A box-tier canvas holds no network resource, and a warmed
                // companion is required rather than opportunistic — left in,
                // it is a texture on a canvas that paints nothing and that the
                // byte budget may never reclaim.
                tileRequests.splice(warmTileMark, warmTiles);
                thumbnailRequests.splice(warmThumbnailMark, warmThumbnails);
            }
            continue;
        }

        // Only the pyramid tier fetches tiles, and the per-level rules are
        // nested inside the tier: a canvas below it releases everything,
        // including its base level. Applied without that gate, "the base level
        // is never evicted" would mean 800 resident base tiles on an 800-folio
        // manifest (spec §Further Notes).

        for (const { image, box, order } of placements) {
            const source = image.source;
            if (source.kind !== 'service') continue;

            const facts = factsFor(source, knownMetadata);
            if (!facts) {
                // Lazy and per-canvas: layout already happened without it, so
                // this costs one request when the canvas needs pixels rather
                // than one per canvas before anything renders.
                askForMetadata();
                continue;
            }

            // A service that advertises tiles is an ordinary pyramid, whatever
            // its compliance level — a level0 one simply has its levels
            // restricted to the advertised scale factors, which `buildPyramid`
            // already is because it builds levels from `scaleFactors` when the
            // service declares them.
            const pyramid = buildPyramid(source.serviceId, facts);
            if (pyramid) {
                planPyramid(
                    canvas.id,
                    pyramid,
                    box,
                    order,
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

            // No tiles advertised — which is TWO different services, and
            // treating them alike is how the decoded-pixel cap gets defeated.
            //
            // A level0 service without tiles is a size-ladder source: fixed
            // whole images, and if it advertises no sizes either, the one
            // canonical whole-image URL level0 compliance guarantees. A level
            // 1/2 service without tiles is not — `tiles` is optional at every
            // compliance level, and Cantaloupe and IIP both ship configurations
            // that omit it, while still answering any region at any size. Given
            // a ladder, such a service's only rung is `full/max`: the entire
            // master, 108 megapixels for a 12000x9000 scan, and the cap cannot
            // refuse it because `chooseRung` must keep the cheapest rung to
            // avoid a blank canvas. It gets a derived power-of-two pyramid
            // instead.
            if (isSizeLadderSource(facts, source.profile)) {
                const ladder = buildSizeLadder(source.serviceId, facts);
                if (!ladder) continue;

                planSizeLadder(
                    canvas.id,
                    ladder,
                    box,
                    order,
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
                source.serviceId,
                facts,
                DERIVED_TILE_SIZE,
            );
            if (!derived) continue;

            planPyramid(
                canvas.id,
                derived,
                box,
                order,
                viewport,
                dpr,
                budgets.minPixelRatio,
                budgets.marginFactor,
                residentTiles,
                tileRequests,
                tileDraws,
            );
        }
    }

    return {
        layout,
        tiers,
        // Centre-out, coarser first on a tie. Sorted here rather than per
        // canvas so a multi-canvas world orders across canvases too.
        tileRequests: tileRequests.sort(
            (a, b) => a.priority - b.priority || a.level - b.level,
        ),
        // **Emitted in paint order, and deliberately NOT sorted.**
        //
        // The order is canvas, then placed image in annotation order, then level
        // ascending — which is what every planner above already produces, since
        // each walks its levels or rungs from the base up. Coarsest-first is
        // what implements blur-up: an incomplete current level paints over the
        // coarse chain rather than over nothing.
        //
        // Sorting the whole list by level looks like the same statement and is a
        // different one. Blur-up is a claim about ONE picture's own levels;
        // applied across a scene it becomes a claim about the composition, and
        // it is false there. A composite canvas's folio is large and settles on
        // a fine level while its miniature is small and settles on a coarse one,
        // so every folio tile above the miniature's level sorts after it and
        // paints over it — the miniature disappears, and only when zoomed IN,
        // because at the thumbnail tier both pictures sit at rungs 0 and 1 and
        // the order survives by luck.
        //
        // Nothing is lost across canvases: layout places them in disjoint boxes,
        // so their draws cannot overlap and their relative order cannot matter.
        tileDraws,
        // Deliberately NOT sorted: manifest annotation order is paint order, and
        // a composite canvas is only correct if its miniature paints after the
        // folio it sits on.
        staticImages,
        // Centre-out, exactly like the tiles they share a scheduler and a
        // concurrency cap with, so what the reader is looking at arrives first.
        thumbnailRequests: thumbnailRequests.sort(
            (a, b) => a.priority - b.priority || a.level - b.level,
        ),
        metadataRequests,
        unresolvedThumbnails,
        minZoom,
    };
}
