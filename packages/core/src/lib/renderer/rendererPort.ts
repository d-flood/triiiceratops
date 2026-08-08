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
 * Two hosts implement it while the development-only renderer flag keeps both
 * renderers in the repository: `CanvasHost.svelte` (first-party Canvas2D) and
 * `OSDViewer.svelte` (the OpenSeadragon path ticket 18 deletes). That is the
 * entire reason the seam is an interface rather than direct calls into the
 * Canvas2D host.
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
}
