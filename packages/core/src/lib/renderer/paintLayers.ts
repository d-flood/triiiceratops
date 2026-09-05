/**
 * The **paint hook**: an ordered layer a consumer registers, called each frame
 * after the tiles are painted, with the 2D context and the current transform
 * (CONTEXT.md **Paint hook**).
 *
 * ## Why a hook rather than an overlay
 *
 * A DOM overlay is repositioned in *response* to the image having moved: an
 * event fires, a derived value recomputes every shape's pixel rect, and styles
 * are written. That is structurally one frame late, and during a pan the shapes
 * visibly trail the image. A paint layer is called **inside** the frame the
 * tiles were drawn in, with the same matrix, so desync is not merely unlikely —
 * there is no second coordinate source for it to drift against.
 *
 * **That argument is about event-driven repositioning, and only that.** It is
 * false of a layer repositioned on the `frame` cadence: the frame listener runs
 * inside the renderer's own animation-frame callback and Svelte flushes on the
 * microtask that follows it, before the browser composites — which is why core's
 * own annotation shape overlay is not a frame behind (see
 * `components/AnnotationShapeOverlay.svelte`). So a frame-cadence DOM layer is
 * not structurally late, and DOM is a legitimate substrate for things over the
 * image; `ViewerState.registerOverlayLayer` and `renderer/overlayLayers.ts` are
 * that API.
 *
 * The choice between the two is therefore NOT about timing. It is the
 * accessibility rule stated below: anything a reader must perceive or operate is
 * DOM in an overlay layer, and a paint layer is decoration or a second rendering
 * of geometry the DOM already carries. What this hook still buys over DOM is
 * cost, not correctness — one draw call per frame rather than a style write per
 * element, which is what makes it the right substrate for ink at a scale where
 * DOM would not keep up.
 *
 * ## What this module owns, and what it does not
 *
 * Everything here is DOM-free arithmetic and bookkeeping: which layers exist, in
 * what order they are called, and what happens when one of them throws. The
 * context, the transform, and the frame loop belong to the renderer host
 * (`components/CanvasHost.svelte`); the public registration surface belongs to
 * `ViewerState.registerPaintLayer`. Neither of those can be unit-tested without
 * a browser, and both are thin over this.
 *
 * ## The accessibility rule this module cannot enforce
 *
 * > The canvas paints pixels; a parallel DOM layer carries the focusable,
 * > labelled targets.
 *
 * Canvas-drawn shapes are invisible to assistive technology: no focus, no
 * accessible name, no keyboard reach, and an automated scan cannot catch their
 * absence because the elements simply would not exist. Anything a reader must
 * perceive or operate needs a DOM element beside the painted pixels, from one
 * source of geometry. A layer registered here is decoration or a second
 * rendering of something the DOM already carries — never the only copy.
 */

import {
    canvasBoxToWorld,
    canvasPointToWorld,
    type CanvasPlacement,
} from './layoutQueries.js';
import type { LayoutRect } from './types.js';
import type { ViewportBox, ViewportPoint } from '../types/viewport.js';

/**
 * The matrix the tiles were drawn with, as numbers.
 *
 * The context handed to a layer already has this applied, so a layer that draws
 * in **world space** — the renderer's laid-out coordinate space, in which every
 * canvas of the manifest has a rect — needs none of it. It is carried explicitly
 * for the layer that wants device pixels instead: reset the transform, and
 * `x_device = x_world * scale + offsetX`.
 *
 * `scale` has `dpr` folded in, exactly as `paintScene.applyViewportTransform`
 * folds it, which is what keeps a layer's ink on the same sub-pixel grid as the
 * tiles rather than half a device pixel off it.
 */
export interface PaintTransform {
    /** Device pixels per world unit — the viewport scale times `dpr`. */
    scale: number;
    /** Device-pixel x of the world origin. */
    offsetX: number;
    /** Device-pixel y of the world origin. */
    offsetY: number;
    /** The backing-store ratio already folded into {@link scale}. */
    dpr: number;
}

/** Where a canvas sits in the space the context is transformed into. */
export interface PaintCanvasPlacement {
    canvasId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * What a layer is told about the frame it is drawing into.
 *
 * The canvas placements are here because the space the context is in is the
 * renderer's **world**, and a manifest with more than one canvas on screen lays
 * them side by side: without knowing where a canvas is, a layer drawing "on
 * folio 12" has nothing to anchor to. They are this frame's own rects, so a
 * layer cannot be looking at a layout the tiles were not drawn from.
 *
 * ## World space is not canvas space, and the conversion is here
 *
 * The context's space is the world, and the public boundary's space is **canvas
 * space** — the IIIF Canvas's own `width`/`height`, which is already how
 * annotation geometry is persisted. The two differ by more than an offset: a
 * canvas's rect is placed beside its neighbours AND may have been resized by
 * layout (median-height normalization for a facing-page spread, and whenever
 * `preserveCanvasScale` is off). A layer holding geometry in canvas space
 * therefore cannot use a rect alone, and `rect.width === canvas.width` is false
 * in exactly the cases this viewer exists for.
 *
 * {@link canvasToWorld} and {@link canvasBoxToWorld} are that conversion, so the
 * hook can express a canvas-anchored layer without a plugin re-deriving the
 * mapping — or, worse, going back to raw Canvas JSON for the declared
 * dimensions, which would put image-space/canvas-space arithmetic back on the
 * plugin boundary this renderer's coordinate contract removes it from. They are
 * methods rather than four more numbers per placement for that reason: the rule
 * (a fraction of the rect, with a canvas whose manifest declared no dimensions
 * falling back to its laid-out extent) is one decision with one wrong answer,
 * and it belongs on this side of the boundary.
 */
export interface PaintFrame {
    transform: PaintTransform;
    /** The surface's size in CSS pixels. */
    width: number;
    height: number;
    /** The canvases in the scene, in paint order. */
    canvases: readonly PaintCanvasPlacement[];
    /**
     * Canvas space → the space the context is in, for one canvas of this frame.
     *
     * `null` when `canvasId` is not one of {@link canvases} — a canvas that is
     * not laid out this frame has no position to answer with, and answering
     * anyway would draw the layer's ink somewhere wrong.
     */
    canvasToWorld(point: ViewportPoint, canvasId: string): ViewportPoint | null;
    /** Canvas space → the space the context is in, for a box. */
    canvasBoxToWorld(box: ViewportBox, canvasId: string): ViewportBox | null;
}

/** A layer's drawing callback. */
export type PaintLayerDraw = (
    ctx: CanvasRenderingContext2D,
    frame: PaintFrame,
) => void;

/** A layer, as a consumer registers it. */
export interface PaintLayer {
    /**
     * A stable identifier, unique within one viewer. It is how a refused
     * duplicate registration is reported and how a throwing layer is named in
     * the log, so it should say which consumer owns it (`myPlugin:handles`).
     */
    id: string;
    /**
     * Where in the stack this layer draws. Lower draws first, so a higher
     * `order` paints over a lower one; layers sharing an `order` are called in
     * registration order. Defaults to `0`.
     */
    order?: number;
    draw: PaintLayerDraw;
}

/** A layer the registry accepted, with its ordering resolved. */
export interface RegisteredPaintLayer {
    id: string;
    order: number;
    /** Registration sequence — the tie-break that makes ordering total. */
    sequence: number;
    draw: PaintLayerDraw;
}

export interface PaintLayerRegistry {
    /**
     * Register a layer. Returns an idempotent unregister; a refused
     * registration returns a no-op one, so a caller never has to branch.
     */
    register(layer: PaintLayer): () => void;
    /**
     * The layers to draw, in call order. A frozen snapshot rebuilt on change
     * rather than sorted per frame: registration happens a handful of times per
     * session and drawing happens sixty times a second.
     */
    readonly layers: readonly RegisteredPaintLayer[];
}

/**
 * Order layers deterministically: by `order`, then by registration sequence.
 *
 * The sequence tie-break is what makes the order **total**. `Array.sort` is
 * required to be stable since ES2019, but the input here is a `Set`'s iteration
 * order, and relying on two separate guarantees to get one property is how a
 * paint order silently changes between engines.
 */
export function sortPaintLayers(
    layers: Iterable<RegisteredPaintLayer>,
): RegisteredPaintLayer[] {
    return [...layers].sort(
        (a, b) => a.order - b.order || a.sequence - b.sequence,
    );
}

/**
 * The registry behind `ViewerState.registerPaintLayer`.
 *
 * It lives in viewer state rather than in the renderer host for two reasons: a
 * consumer may register before any renderer has mounted, and a renderer remount
 * must not silently drop every layer. The host reads the list each frame.
 *
 * `onChange` is how the host learns to repaint — a layer registered while the
 * viewport is idle would otherwise not appear until something unrelated moved.
 */
export function createPaintLayerRegistry(options?: {
    onChange?: () => void;
    /** Told why a registration was refused, for the developer's console. */
    onRefused?: (message: string) => void;
}): PaintLayerRegistry {
    // A plain Set, deliberately not a `SvelteSet`: the reactive signal is the
    // `onChange` callback, which viewer state turns into exactly one state
    // write. A reactive collection here would additionally wake the batched
    // state watcher for every internal read the sort does.
    const held = new Set<RegisteredPaintLayer>();
    let sequence = 0;
    let snapshot: readonly RegisteredPaintLayer[] = [];

    function rebuild(): void {
        snapshot = Object.freeze(sortPaintLayers(held));
        options?.onChange?.();
    }

    return {
        get layers() {
            return snapshot;
        },

        register(layer: PaintLayer): () => void {
            const id = typeof layer?.id === 'string' ? layer.id.trim() : '';
            if (!id || typeof layer?.draw !== 'function') {
                options?.onRefused?.(
                    'registerPaintLayer needs an { id, draw } layer: a non-empty string id and a draw function.',
                );
                return () => {};
            }

            // Refused rather than allowed to shadow: the id is what names this
            // layer in a log and in a duplicate-registration report, and two
            // layers answering to one name makes both reports ambiguous. It is
            // also the shape a plugin activated twice would take, which is worth
            // saying out loud rather than silently drawing twice.
            for (const existing of held) {
                if (existing.id === id) {
                    options?.onRefused?.(
                        `registerPaintLayer ignored a second layer with id "${id}"; ids are unique within a viewer.`,
                    );
                    return () => {};
                }
            }

            const order =
                typeof layer.order === 'number' && Number.isFinite(layer.order)
                    ? layer.order
                    : 0;
            const registered: RegisteredPaintLayer = {
                id,
                order,
                sequence: sequence++,
                draw: layer.draw,
            };
            held.add(registered);
            rebuild();

            let released = false;
            return () => {
                if (released) return;
                released = true;
                held.delete(registered);
                rebuild();
            };
        },
    };
}

/**
 * Call every layer, in order, with the context transformed as the tiles were.
 *
 * Each layer is wrapped in `save`/`restore` and in a `try`. Both matter, and for
 * the same reason: a layer runs inside the renderer's own frame, between the
 * tiles and whatever comes next.
 *
 * - **`save`/`restore`** means a layer that leaves a clip, an alpha, or a
 *   transform behind cannot change what the next layer draws — or what the next
 *   FRAME draws, since the context outlives the call.
 * - **`try`** means a layer that throws does not abort the frame. Without it one
 *   consumer's bug stops the renderer painting at all, and the exception lands
 *   inside a `requestAnimationFrame` callback where nothing can act on it.
 *
 * The error is handed out rather than logged here so the caller can say it once
 * per layer: a layer that throws does it every frame, and sixty identical
 * console errors a second is indistinguishable from a hang.
 */
export function drawPaintLayers(
    ctx: CanvasRenderingContext2D,
    layers: readonly RegisteredPaintLayer[],
    frame: PaintFrame,
    onError: (layer: RegisteredPaintLayer, error: unknown) => void,
): void {
    for (const layer of layers) {
        ctx.save();
        try {
            layer.draw(ctx, frame);
        } catch (error) {
            onError(layer, error);
        } finally {
            ctx.restore();
        }
    }
}

/**
 * This frame's placements, from the scene plan's layout.
 *
 * A mapping function rather than the layout rects themselves: `LayoutRect` is
 * the planner's own type and carries whatever the planner needs it to, where
 * {@link PaintCanvasPlacement} is a public promise about four numbers and an id.
 */
export function paintCanvasPlacements(
    layout: readonly LayoutRect[],
): PaintCanvasPlacement[] {
    return layout.map((rect) => ({
        canvasId: rect.canvasId,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    }));
}

/** A Canvas's declared dimensions, `null` where the manifest omits one. */
export type DeclaredCanvasSize = (canvasId: string) => {
    width: number | null;
    height: number | null;
};

/**
 * This frame's canvas half: where each canvas is, and how to get into that space
 * from canvas space.
 *
 * Built once per frame beside the transform, from the SAME layout the tiles were
 * drawn from — which is what makes a layer's conversion agree with the picture
 * rather than with whatever layout is current by the time the layer runs.
 *
 * The placement index is built **lazily**, on the first conversion: an 800-folio
 * manifest lays out hundreds of rects per frame, and a layer that only reads
 * `canvases` (core's own page-placeholder layer, for one) must not pay for a map
 * it never looks anything up in.
 */
export function paintCanvasSpace(
    layout: readonly LayoutRect[],
    declaredSize: DeclaredCanvasSize,
): Pick<PaintFrame, 'canvases' | 'canvasToWorld' | 'canvasBoxToWorld'> {
    let index: Map<string, CanvasPlacement> | null = null;

    function placementOf(canvasId: string): CanvasPlacement | null {
        if (!index) {
            index = new Map();
            for (const rect of layout) {
                const declared = declaredSize(rect.canvasId);
                index.set(rect.canvasId, {
                    rect,
                    width: declared?.width ?? null,
                    height: declared?.height ?? null,
                });
            }
        }
        return index.get(canvasId) ?? null;
    }

    return {
        canvases: paintCanvasPlacements(layout),

        canvasToWorld(point: ViewportPoint, canvasId: string) {
            const placement = placementOf(canvasId);
            return placement ? canvasPointToWorld(point, placement) : null;
        },

        canvasBoxToWorld(box: ViewportBox, canvasId: string) {
            const placement = placementOf(canvasId);
            return placement ? canvasBoxToWorld(box, placement) : null;
        },
    };
}
