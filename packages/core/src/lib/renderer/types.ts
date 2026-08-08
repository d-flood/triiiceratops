/**
 * The renderer's vocabulary as types (CONTEXT.md §Renderer domain).
 *
 * Everything here is plain data. Nothing in this module — or anywhere else in
 * the renderer's module graph — touches `window`, `document`, or `navigator` at
 * module scope, which is what keeps the viewer server-renderable and the
 * planner runnable in plain Node.
 */

import type { ViewingDirection, ViewingMode } from '../components/osdLayout';

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
 * One canvas as the planner sees it: an identity, its geometry in **canvas
 * space** (manifest Canvas `width`/`height`), and where its pixels come from.
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
    source: SourceDescriptor;
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
     * the OpenSeadragon path at its current value, with its semantics, so
     * sharpness-versus-speed does not visibly shift (ticket 05 §Contract). See
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
 * A tile's stable identity: canvas, level, and position in that level's grid.
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
    level: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A whole-image request sized to a canvas's projection, quantized to a rung. */
export interface ThumbnailRequest {
    canvasId: string;
    url: string;
    rung: number;
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
     * already chosen (see `components/osdLayout`).
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
    /** canvasId → image-service facts already fetched. */
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
    thumbnailRequests: ThumbnailRequest[];
    /** Canvas ids needing an `info.json` fetch now. */
    metadataRequests: string[];
    /** Canvas ids droppable under budget pressure. */
    evictable: string[];
    /**
     * Canvas ids drawn **over** `budgets.maxDecodedPixels` because every image
     * their service offers exceeds it.
     *
     * The cap normally degrades to blur: a rung above it is refused and a
     * coarser one is taken. When even the cheapest rung is over the ceiling
     * there is no coarser one, and the choice is between a blank canvas and a
     * decode the budget said no to. The renderer draws it — never blank wins —
     * and reports it here rather than overriding the budget in silence. Ticket
     * 12 owns what a host does with this.
     */
    overCapCanvases: string[];
    /** The derived zoom floor, in the same units as `Viewport.scale`. */
    minZoom: number;
}
