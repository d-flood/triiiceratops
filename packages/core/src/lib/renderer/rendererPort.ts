/**
 * The seam between `ViewerState`'s viewport API and the mounted renderer.
 *
 * **Core-internal.** It is not a pass-through and not a successor to one: it
 * hands out no renderer object, no DOM node, and no third-party surface. It is
 * a fixed set of first-party operations, governed by core's own semver, that a
 * host component implements so viewer state can answer viewport questions and
 * issue viewport commands without knowing which renderer is mounted. Plugins
 * never see it — they see the `ViewerState` methods below it.
 *
 * One host implements it — `CanvasHost.svelte` — now that the previous renderer
 * is gone. It stays an interface rather than direct calls into that host because
 * it is also what the shipped renderer stand-in implements for plugin tests, and
 * because it is the line viewer state is not allowed to reach across.
 *
 * **Coordinates.** Every point and box crossing this interface is in **canvas
 * space** — the IIIF Canvas's own `width`/`height` — or in **screen space**,
 * the viewer surface's CSS pixels from its top-left corner. Image space stays
 * inside the renderer.
 *
 * **Which canvas.** Methods taking a `canvasId` address that canvas's own
 * space; omitting it means the viewer's current canvas. A host that cannot
 * answer for the canvas asked about returns `null` rather than silently
 * answering for a different one.
 */

import type {
    ContainerSize,
    ImageAdjustments,
    ViewportBox,
    ViewportPoint,
} from '../types/viewport.js';

export interface RendererPort {
    // ---- Commands ---------------------------------------------------------

    /**
     * Multiply the zoom by `factor`, anchored at a screen-space point — the
     * world point under `anchor` stays under it. Omitting the anchor zooms
     * about the viewport centre, which is what a toolbar button wants.
     */
    zoomBy(factor: number, anchor?: ViewportPoint): void;
    /** Zoom to an absolute scale — screen pixels per canvas-space unit. */
    zoomTo(scale: number): void;
    /** Centre the viewport on a canvas-space point. */
    panTo(centre: ViewportPoint, canvasId?: string): void;
    /** Fit a canvas-space box into the viewport. */
    fitBounds(bounds: ViewportBox, canvasId?: string): void;
    /** Fit a whole canvas — the viewer's current one unless named. */
    fitCanvas(canvasId?: string): void;

    // ---- Queries ----------------------------------------------------------

    /**
     * Screen pixels per canvas-space unit, or `0` before the surface is sized.
     * The single number relating the two spaces.
     */
    getScale(): number;
    /** The canvas-space point at the middle of the viewport. */
    getCentre(canvasId?: string): ViewportPoint | null;

    /**
     * The canvases the reader is **looking at**, in layout order — what an
     * overlay has to draw for, and empty before the surface is sized.
     *
     * Only the renderer can answer this. In `individuals` and `paged` it is the
     * laid-out world, which there IS the current canvas or the current spread:
     * zooming into one page of a spread does not stop the facing page from being
     * open. In `continuous` the world is the whole manifest, so it is the
     * canvases whose laid-out rect meets the viewport — never the viewer's
     * "current" canvas, which after a scroll from folio 1 to folio 400 is 399
     * folios behind what is on screen.
     */
    getVisibleCanvasIds(): string[];
    /** The canvas-space box the viewport currently shows. */
    getVisibleBounds(canvasId?: string): ViewportBox | null;
    /** The surface's size in CSS pixels; zeroes before it is measured. */
    getContainerSize(): ContainerSize;

    // ---- Coordinates ------------------------------------------------------

    /** Canvas space → screen space. */
    canvasToScreen(
        point: ViewportPoint,
        canvasId?: string,
    ): ViewportPoint | null;
    /** Screen space → canvas space. */
    screenToCanvas(
        point: ViewportPoint,
        canvasId?: string,
    ): ViewportPoint | null;

    // ---- Presentation -----------------------------------------------------

    /**
     * Adopt an adjustment set. Called on every change and once at attach, so a
     * renderer mounting after the adjustments were set still shows them.
     */
    applyImageAdjustments(adjustments: ImageAdjustments): void;

    // ---- Cadence ----------------------------------------------------------

    /**
     * Subscribe to the renderer's **own animation events** — what the `frame`
     * selector cadence is woken by (CONTEXT.md **Selector cadence**). The
     * listener takes no payload: it means "the viewport moved, read what you
     * need". Returns an idempotent unsubscribe.
     */
    onFrame(listener: () => void): () => void;

    // ---- Discrete input reserved for selection -----------------------------

    /**
     * Subscribe to a **single tap** on the image surface, in screen space.
     *
     * The one gesture the viewport deliberately does not consume (`clickToZoom`
     * is false): it is reserved for annotation selection, and it arrives here
     * already filtered by the renderer's single arbitration point — never for a
     * drag, a pinch, or a gesture refused because something held an input claim.
     * A host reports it; deciding what was tapped belongs to whoever holds the
     * geometry. Returns an idempotent unsubscribe.
     */
    onTap(listener: (point: ViewportPoint) => void): () => void;
}
