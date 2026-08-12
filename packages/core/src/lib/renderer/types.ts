/**
 * The renderer's vocabulary as types (CONTEXT.md §Renderer domain).
 *
 * Everything here is plain data. Nothing in this module — or anywhere else in
 * the renderer's module graph — touches `window`, `document`, or `navigator` at
 * module scope, which is what keeps the viewer server-renderable and the
 * planner runnable in plain Node.
 */

import type { ViewingDirection, ViewingMode } from '../components/canvasLayout';

export type { ViewingDirection, ViewingMode };

/**
 * Where a canvas's pixels come from.
 *
 * `static` is one known URL. `service` is an image service the planner resolves
 * once its `info.json` has been fetched — into a tile pyramid when it advertises
 * tiles (`tilePyramid`), and otherwise into a **size-ladder source**
 * (`sizeLadder`), which is the level0 shape that can serve only fixed whole
 * images. Which of the two a service is comes from what it advertises, not from
 * its declared profile: a profile can be missing, and a level0 service that
 * advertises tiles is an ordinary pyramid.
 */
export type SourceDescriptor =
    | { kind: 'static'; url: string }
    | { kind: 'service'; serviceId: string; profile: string | null };

/**
 * One picture placed on a canvas by one painting annotation: where its pixels
 * come from, and the box it paints into.
 *
 * **A canvas is a composition of these, not a single image.** IIIF Cookbook
 * recipe 0036 is the canonical case — a folio painted by its full scan, with a
 * miniature painted over a rectangle of it — and both halves of that are
 * modelled here rather than in the canvas: an annotation that targets
 * `#xywh=` paints into a sub-rectangle, and a canvas may carry as many
 * annotations as the publisher wrote. Collapsing either one to "the first
 * source" drops pictures the manifest asked for, silently.
 *
 * Placement is **normalized by the Canvas's own width on BOTH axes**, exactly
 * as `utils/resolveCanvasImage` computes it: one vertical unit equals one
 * horizontal unit, so a canvas-filling image is `x: 0, y: 0, width: 1` with
 * `height` the canvas's aspect ratio, and a region-targeted image gets its
 * target's box in the same units. Fractions rather than canvas pixels because
 * layout scales a canvas to the median height — a normalized placement rides
 * that scaling for free, while a pixel offset would have to be rescaled at
 * every use and would be wrong the moment it was not.
 *
 * This is deliberately the same normalization the export path already lays out
 * in (`utils/resolveCanvasImage.PositionedTileSource`), so a composite canvas
 * cannot compose one way on screen and another way in an export.
 */
export interface PlannerImage {
    /**
     * This placed image's stable identity, unique across the manifest.
     *
     * Needed because a canvas id no longer names a picture once a canvas can
     * carry several: the host holds at most one decoded whole image per
     * *placement*, not per canvas, and keying that record on the canvas would
     * let a composite canvas's second image evict its first every frame. Spelled
     * by `canvasDescriptors.toPlannerCanvas` from the canvas id and the
     * annotation's position, so it is stable across frames and across a Choice
     * switch — which is what lets `imageRequests.reconcileImages` notice that
     * the same placement now wants a different URL.
     */
    key: string;
    source: SourceDescriptor;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * One canvas as the planner sees it: an identity, its geometry in **canvas
 * space** (manifest Canvas `width`/`height`), and the pictures painted on it.
 *
 * Geometry is manifest geometry, never image-service geometry: layout must not
 * depend on any fetch (spec §Coordinate model and layout). Where the two
 * disagree — which is routine — the manifest wins permanently, so nothing on
 * screen moves when tiles arrive.
 *
 * `width`/`height` are `null` for a canvas whose manifest declares no usable
 * dimensions, which is a spec violation the viewer still has to render (user
 * story 32). Such a canvas is laid out from the **median of its siblings** and
 * repositioned if an image service later reports real ones — never blocked on a
 * fetch, which is the reflex that restores the fetch storm for any manifest
 * with sparse metadata. See `planScene.resolveGeometry`.
 */
export interface PlannerCanvas {
    id: string;
    width: number | null;
    height: number | null;
    /**
     * Every picture painted on this canvas, in the manifest's own annotation
     * order — which is paint order, so a later entry paints over an earlier one.
     *
     * Never empty: `canvasDescriptors.toPlannerCanvas` returns `null` for a
     * canvas that paints nothing usable, so such a canvas never becomes a
     * `PlannerCanvas` at all. The overwhelmingly common case is exactly one
     * entry covering the whole canvas.
     */
    images: PlannerImage[];
    /**
     * The Canvas's own declared `thumbnail`, as a fixed URL — the first rung of
     * the **thumbnail tier**'s resolution ladder, used as-is with the size
     * ladder ignored (spec §Thumbnail resolution).
     *
     * A **raw-JSON** fact: `thumbnail` is spelled the same in IIIF v2 and v3
     * and is read straight off the manifest by
     * `canvasDescriptors.getDeclaredThumbnailUrl`. It is deliberately carried
     * on the descriptor rather than looked up per frame, because it costs a
     * walk of the Canvas and the host builds descriptors once per manifest
     * (`CanvasHost.plannerCanvases`) rather than once per frame.
     *
     * `null` where the Canvas declares none, which is the usual case and simply
     * means the ladder starts at its second rung.
     *
     * A **canvas-level** fact, and on a composite canvas that is the whole
     * point: a declared thumbnail depicts the finished canvas, miniature and
     * all, so it is painted once over the whole canvas box rather than resolved
     * per placed image. Only where a canvas declares none does the thumbnail
     * tier fall back to each image's own service ladder, painted into each
     * image's own box (see `planScene.planThumbnail`).
     */
    thumbnailUrl?: string | null;
}

/** A point in canvas space. */
export interface Point {
    x: number;
    y: number;
}

/**
 * The viewport, in canvas space plus screen size.
 *
 * `scale` is screen pixels per canvas-space unit — the single number that
 * relates the two spaces. `centre` is the canvas-space point at the middle of
 * the viewport.
 */
export interface Viewport {
    /** Viewport width in CSS pixels. */
    width: number;
    /** Viewport height in CSS pixels. */
    height: number;
    centre: Point;
    scale: number;
}

/**
 * Image-service facts already fetched for a canvas — everything `info.json`
 * says that the renderer acts on.
 *
 * These govern the **tile pyramid only**. Geometry comes from the manifest
 * Canvas and wins permanently, so `width`/`height` disagreeing with the
 * manifest's cannot move anything on screen (spec §Coordinate model and
 * layout).
 */
export interface ImageServiceFacts {
    /**
     * The image-service base URI declared by `info.json`.
     *
     * This may differ from the URI that fetched the document. Authentication
     * gateways commonly return a signed base URI, and every image request must
     * use that returned identity while metadata remains cached.
     */
    requestBaseUri?: string;
    width: number;
    height: number;
    /** Advertised whole-image sizes, if the service declares any. */
    sizes?: Array<{ width: number; height: number }>;
    /**
     * Advertised tile width. Absent means the service advertises no tiling at
     * all — which is a **size-ladder source only when the service is also
     * level0**. A level 1/2 service may legally omit `tiles` and still answer
     * any region at any size, so absence alone says nothing about which source
     * kind this is; see `planScene`.
     */
    tileSize?: number | null;
    scaleFactors?: number[];
    /**
     * Whether the document's own `profile` declares compliance level0.
     *
     * The one fact the renderer takes from a profile rather than from what a
     * service advertises, and it is load-bearing twice: a tile-less service is
     * a size-ladder source only if it is level0 (otherwise it is an ordinary
     * pyramid whose tile size the renderer chooses), and a level0 service's
     * whole-image requests must be snapped to a size it actually generated.
     */
    level0?: boolean;
    /** IIIF Image API major version, which decides `quality` in a tile URL. */
    version?: 2 | 3;
    /** Image format extension for tile requests. Defaults to `jpg`. */
    format?: string;
}

/**
 * Planner inputs that are policy rather than fact.
 *
 * Every value here is provisional (spec §Further Notes) and supplied by the
 * caller precisely so tests never assert against shipped defaults.
 */
export interface PlannerBudgets {
    /** Decoded-pixel byte ceiling for the opportunistic cache. */
    byteBudget: number;
    /** Residency margin as a factor the viewport rect is inflated by. */
    marginFactor: number;
    /** `effectiveSize` at or above which a canvas is in the pyramid tier. */
    pyramidThreshold: number;
    /** `effectiveSize` below which a canvas is in the box tier. */
    boxThreshold: number;
    /**
     * The least **device** pixels per level pixel a level may carry before the
     * next coarser one is taken instead. At 0.5, up to 2× oversampling is
     * tolerated; a *higher* value accepts a blurrier level. Carried forward from
     * the previous renderer at its value, with its semantics, so
     * sharpness-versus-speed does not visibly shift. See
     * `tilePyramid.chooseLevel`.
     */
    minPixelRatio: number;
    /**
     * Ceiling, in decoded pixels, on one whole image a **size-ladder source**
     * may be promoted to.
     *
     * Only that source kind needs it, and only it can be defeated without it: a
     * tile is bounded by the tile size, but a size ladder's top rung is the
     * whole scan, and for a large manuscript that is a 100+ megapixel JPEG whose
     * decode pins hundreds of megabytes and can hard-crash a phone. Past the cap
     * the blur is accepted. See `sizeLadder.chooseRung`.
     */
    maxDecodedPixels: number;
}

/** Which of the three treatments a canvas receives this frame. */
export type ResidencyTier = 'pyramid' | 'thumbnail' | 'box';

/** Where layout placed one canvas, in canvas space. */
export interface LayoutRect {
    canvasId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * A tile's stable identity: canvas, the service its pixels come from, level, and
 * position in that level's grid.
 *
 * Built by `tilePyramid.tileKey`; opaque everywhere else. It is what the
 * scheduler keys residency on and what a **tile draw** names, so the planner
 * can decide what to paint without holding any pixels.
 */
export type TileKey = string;

/**
 * One tile of the **required set** — what must be resident, not what is
 * missing. The scheduler skips the ones it already holds and releases anything
 * absent from the list, so residency stays a pure function of the viewport
 * rather than of what happened to be fetched.
 */
export interface TileRequest {
    key: TileKey;
    canvasId: string;
    /** 0 is the base (coarsest) level; larger is finer. */
    level: number;
    url: string;
    /**
     * Distance in canvas space from the viewport centre to the tile's centre.
     * The queue is ordered by this, so tiles arrive centre-out rather than in
     * discovery order — and is re-sorted as the viewport moves.
     */
    priority: number;
    /**
     * A second spelling of the same image, tried **once** if `url` fails, and
     * remembered for `group` so the rest of that group skips the failed
     * spelling entirely.
     *
     * It exists for exactly one deviation the renderer knowingly takes: a
     * version 2 service is asked for `default` quality, never the deprecated
     * `native`, because a 2.0 document is indistinguishable from a 2.1 one
     * (`imageService.parseVersion`). That answer is right for every endpoint
     * built since 2016 and wrong for a frozen static tree that only ever
     * generated `native` files — and for a **size-ladder source** every rung
     * shares the quality parameter, so getting it wrong is not a blurrier
     * canvas but a permanently blank one once the negative cache closes over
     * the whole ladder.
     *
     * One request per broken service buys the answer, and the happy path never
     * spells a URL two ways: the fallback is only ever reached from a failure.
     */
    fallback?: { url: string; group: string };
}

/**
 * One tile the painter should draw, and the canvas-space box it occupies.
 *
 * Ordered coarsest level first, which is what implements **blur-up**: the
 * coarse chain is resident, so an incomplete current level is painted over
 * something rather than over nothing, and the viewer is never blank.
 */
export interface TileDraw {
    key: TileKey;
    /**
     * Which canvas this draw belongs to.
     *
     * The painter does not need it — a draw carries its own box. The HOST does:
     * "does this canvas have anything on screen this frame?" is the question that
     * decides whether an opaque error placeholder may cover it, and a canvas can
     * have a failure recorded against its image service while a public declared
     * thumbnail paints perfectly well over the same rect. Answered from the key's
     * spelling instead, that question would be a string parse over an identifier
     * that is a URI.
     */
    canvasId: string;
    level: number;
    /**
     * Which **placed image** this draw belongs to, as a plan-wide index in paint
     * order (see {@link ScenePlan.tileDraws}).
     *
     * Carried so the painter can interleave these with {@link StaticImageDraw}s:
     * a canvas may compose a tiled folio with a plain-JPEG overlay, and drawing
     * every whole image before every tile would put the overlay underneath the
     * thing it overlays.
     */
    order: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * A whole-image request sized to a canvas's projection, quantized to a rung.
 *
 * A {@link TileRequest} by extension, and that is not a convenience: it means
 * the scheduler's abort-on-supersede, centre-out priority queue, bounded
 * in-flight window, negative cache, off-thread decode, and byte-budgeted
 * **opportunistic cache** all apply to thumbnails without a second
 * implementation of any of them — the same reasoning that expresses a
 * **size-ladder source**'s rungs as one-tile levels (`planScene.planSizeLadder`).
 * The host hands the two lists to one scheduler, so the concurrency cap really
 * is global and a thumbnail and a tile compete on distance from the viewport
 * centre rather than on which list they arrived in.
 *
 * `rung` is carried beyond what the scheduler needs, because "a continuous zoom
 * produces a small set of distinct URLs" is a claim about the quantization and
 * a test has to be able to read it.
 */
export interface ThumbnailRequest extends TileRequest {
    /** The quantized ladder rung, in device pixels of requested width. */
    rung: number;
}

/**
 * One **static-image** placement the host should hold decoded, and the
 * canvas-space box it paints into.
 *
 * A static source has one known URL, no service, and therefore nothing to
 * discover and nothing to tile (user story 29). It is fetched by the host as a
 * plain `<img>` rather than through the tile scheduler, so it needs its own
 * channel out of the plan — but the DECISION of whether it is wanted at all is
 * the planner's, exactly like every other: a canvas outside the residency
 * window contributes none of these, which is what keeps an 800-folio manifest
 * of plain JPEGs from starting 800 image loads on open.
 *
 * Emitted per **placed image**, not per canvas. That is the whole of composite
 * support on this path: two static images on one canvas are two entries with
 * two boxes, and the painter draws both.
 */
export interface StaticImageDraw {
    /** {@link PlannerImage.key} — what the host's decoded image is held under. */
    key: string;
    /**
     * The canvas this placement belongs to.
     *
     * Carried because failures are recorded against the CANVAS
     * (`CanvasHost.canvasErrors`) while pixels are held against the placement,
     * and the host needs both names for the same request.
     */
    canvasId: string;
    url: string;
    /**
     * Which **placed image** this is, as a plan-wide index in paint order — the
     * same sequence {@link TileDraw.order} indexes into, so the painter can
     * merge the two lists and honour annotation order across both.
     */
    order: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Everything that decides **where the canvases are** — and nothing else.
 *
 * Deliberately a separate input from {@link PlanSceneInput}: the world's layout
 * and the zoom floor derived from it depend on neither the viewport nor
 * residency, and the host asks for them on every pointer sample. Splitting the
 * inputs is what makes `planViewportLimits` cheap by construction rather than
 * by discipline — a caller cannot accidentally pay for tile enumeration when
 * the viewport is not even in the signature.
 *
 * `knownMetadata` is here because geometry can depend on it in exactly one
 * case: a canvas whose manifest declared no dimensions is repositioned when an
 * image service reports real ones.
 */
export interface PlanWorldInput {
    canvases: PlannerCanvas[];
    mode: ViewingMode;
    direction: ViewingDirection;
    preserveCanvasScale: boolean;
    /**
     * Inter-canvas gap, as a fraction of the median **laid-out** canvas extent
     * along the axis the world flows in.
     *
     * A **fraction**, not a length, because the renderer's world is canvas
     * space — manifest Canvas pixels — where a page is a few thousand units
     * across and any absolute default would be either a hairline or a chasm
     * depending on the manifest. It is passed through to the shared layout
     * function, which resolves it after normalization and on the axis it has
     * already chosen (see `components/canvasLayout`).
     *
     * Here rather than in {@link PlannerBudgets} because it is a statement
     * about where canvases go, like `mode` and `direction` beside it, and not a
     * byte, pixel, or threshold quantity. Tuning the budgets must not be able
     * to move canvases on screen as a side effect.
     *
     * Not configuration: no public surface exposes it, and none is added here
     * (spec §Out of Scope).
     */
    gapFraction: number;
    /**
     * serviceId → image-service facts already fetched.
     *
     * Keyed on the **service**, not on the canvas that happens to be painting
     * from it: a canvas id is not a stable name for a picture, so a Choice
     * switch would otherwise be answered with the previous alternative's
     * dimensions and would never provoke the new service's `info.json`. See
     * `planScene.factsFor`.
     */
    knownMetadata: Record<string, ImageServiceFacts>;
    budgets: PlannerBudgets;
}

export interface PlanSceneInput extends PlanWorldInput {
    viewport: Viewport;
    /**
     * Device pixels per CSS pixel of the backing store, defaulting to 1.
     *
     * A planner input rather than a painter detail: the viewport is measured in
     * CSS pixels, so this is the only thing that says how many pixels the
     * display can actually resolve, and level selection is a question about
     * pixels the screen can show (`tilePyramid.chooseLevel`). Left out of
     * {@link Viewport} because the viewport is the coordinate model — a device
     * ratio moves nothing in canvas space.
     */
    dpr?: number;
    /**
     * Which tiles the host currently holds decoded.
     *
     * Read only to decide `tileDraws` — what can be painted this frame is a
     * planner decision like every other, and passing residency in as data keeps
     * the planner pure while leaving the painter with nothing to decide.
     */
    residentTiles?: ReadonlySet<TileKey>;
    /**
     * Whether the view has stopped moving — no gesture in progress, no spring
     * settling, no momentum, no held key. Defaults to `true`, which is what an
     * idle caller and every test that does not care are describing.
     *
     * **The view-stable gate** (spec §Tile scheduling). No thumbnail and no
     * `info.json` request is issued while this is false. A flick passes over
     * hundreds of canvases that are never dwelt on, and asking for each one as
     * it goes by is most of the request storm on its own — so the ones the
     * reader actually stops at are the only ones asked for.
     *
     * It gates **discovery**, not residency: tiles are unaffected (a pyramid-
     * tier canvas is one the reader is looking at, and letting it go blank
     * during a drag would be worse than the requests), and a thumbnail already
     * decoded stays in the required set so it keeps painting through the
     * gesture rather than being demoted and blanking.
     */
    viewStable?: boolean;
}

/**
 * The planner's pure output for one frame. A value produced and discarded each
 * frame — not state anything holds.
 */
export interface ScenePlan {
    layout: LayoutRect[];
    /** canvasId → tier. */
    tiers: Record<string, ResidencyTier>;
    /** The required set, ordered by priority — nearest the viewport centre first. */
    tileRequests: TileRequest[];
    /** What to paint, coarsest level first. Only tiles the host already holds. */
    tileDraws: TileDraw[];
    /**
     * Every **static-image** placement the host should be holding this frame,
     * with the box to paint it into.
     *
     * Already gated by the tier, so the painter and the host both take it as
     * given: a box-tier canvas contributes nothing here, and neither does a
     * canvas that paints only from image services. In manifest annotation order
     * within a canvas, so painting the list in order composes correctly.
     */
    staticImages: StaticImageDraw[];
    /**
     * The **thumbnail tier**'s share of the required set, ordered by priority
     * beside `tileRequests` and fed to the same scheduler.
     */
    thumbnailRequests: ThumbnailRequest[];
    /** Canvas ids needing an `info.json` fetch now. */
    metadataRequests: string[];
    /**
     * Canvas ids that reached the end of the thumbnail ladder with nothing
     * usable, and are therefore **box tier permanently**.
     *
     * Reported rather than logged because the planner is pure, and reported at
     * all because a silently blank canvas is indistinguishable from one still
     * loading. The host logs each id **once** (`CanvasHost.reportUnresolvedThumbnails`),
     * keyed on the canvas id alone — which it may do because the decision is a
     * pure function of the manifest and the service's facts and of NOTHING
     * ELSE. In particular it does not depend on the rung, so it cannot change
     * as the reader zooms: `thumbnailLadder` refuses on decoded pixels, a
     * property of the images the service offers, rather than on any
     * rung-relative comparison. If that ever stops being true the report has to
     * be keyed on the pair and "permanently" has to come out of this sentence.
     */
    unresolvedThumbnails: string[];
    /**
     * Canvas ids drawn **over** `budgets.maxDecodedPixels` because every image
     * their service offers exceeds it.
     *
     * The cap normally degrades to blur: a rung above it is refused and a
     * coarser one is taken. When even the cheapest rung is over the ceiling
     * there is no coarser one, and the choice is between a blank canvas and a
     * decode the budget said no to. The renderer draws it — never blank wins —
     * and reports it here rather than overriding the budget in silence, so a
     * host can decide what to do with it.
     */
    overCapCanvases: string[];
    /** The derived zoom floor, in the same units as `Viewport.scale`. */
    minZoom: number;
}
