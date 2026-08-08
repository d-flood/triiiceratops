/**
 * A headless stand-in for a mounted renderer.
 *
 * The renderer is no longer a third-party object a test can bring its own stub
 * for, so core ships one. It is what makes the `frame` selector cadence and the
 * viewport queries exercisable with no DOM, no canvas, and no network — and it
 * is the same seam a real host attaches through (`ViewerState.attachRenderer`),
 * so a test drives the production path rather than a parallel one.
 *
 * Deliberately dumb: it stores a view and answers from it. It does not clamp,
 * animate, constrain, or lay anything out — those belong to the real renderer
 * and are tested against it. What this proves is wiring: that a command
 * reaches the renderer, that a query reads through to it, and that a frame tick
 * wakes a `frame`-cadence selector.
 */

import type { RendererPort } from '../renderer/rendererPort.js';
import {
    NEUTRAL_IMAGE_ADJUSTMENTS,
    type ContainerSize,
    type ImageAdjustments,
    type ViewportBox,
    type ViewportPoint,
} from '../types/viewport.js';

/** The view a {@link RendererStub} reports, all in canvas space. */
export interface StubView {
    /** Screen pixels per canvas-space unit. */
    scale: number;
    centre: ViewportPoint;
    /** Surface size in CSS pixels. */
    container: ContainerSize;
}

export const DEFAULT_STUB_VIEW: StubView = {
    scale: 1,
    centre: { x: 0, y: 0 },
    container: { width: 800, height: 600 },
};

/** A {@link RendererPort} plus the controls a test drives it with. */
export interface RendererStub extends RendererPort {
    /** The view as it currently stands. */
    readonly view: StubView;
    /** The last adjustment set handed to {@link applyImageAdjustments}. */
    readonly adjustments: ImageAdjustments;
    /** Every command received, in order — `['zoomBy', 1.2]` and friends. */
    readonly calls: Array<[string, ...unknown[]]>;
    /** Move the view without going through a command. */
    setView(view: Partial<StubView>): void;
    /**
     * Fire one animation event, waking every `frame`-cadence subscriber. The
     * renderer's own cadence, delivered synchronously — no `requestAnimationFrame`
     * and no timer, so a test never waits on a real frame.
     */
    emitFrame(): void;
    /** How many `frame`-cadence listeners are currently attached. */
    readonly frameListenerCount: number;
}

/**
 * Build a {@link RendererStub}. Attach it with
 * `viewerState.attachRenderer(stub)`, which returns the detach function.
 */
export function createRendererStub(
    initialView: Partial<StubView> = {},
): RendererStub {
    let view: StubView = { ...DEFAULT_STUB_VIEW, ...initialView };
    let adjustments: ImageAdjustments = NEUTRAL_IMAGE_ADJUSTMENTS;
    const calls: Array<[string, ...unknown[]]> = [];
    const listeners = new Set<() => void>();

    const record = (name: string, ...args: unknown[]): void => {
        calls.push([name, ...args]);
    };

    const stub: RendererStub = {
        get view() {
            return view;
        },
        get adjustments() {
            return adjustments;
        },
        calls,
        get frameListenerCount() {
            return listeners.size;
        },
        setView(next: Partial<StubView>): void {
            view = { ...view, ...next };
        },
        emitFrame(): void {
            for (const listener of [...listeners]) listener();
        },

        zoomBy(factor: number, anchor?: ViewportPoint): void {
            record('zoomBy', factor, anchor);
            view = { ...view, scale: view.scale * factor };
        },
        zoomTo(scale: number): void {
            record('zoomTo', scale);
            view = { ...view, scale };
        },
        panTo(centre: ViewportPoint, canvasId?: string): void {
            record('panTo', centre, canvasId);
            view = { ...view, centre: { ...centre } };
        },
        fitBounds(bounds: ViewportBox, canvasId?: string): void {
            record('fitBounds', bounds, canvasId);
            view = {
                ...view,
                centre: {
                    x: bounds.x + bounds.width / 2,
                    y: bounds.y + bounds.height / 2,
                },
            };
        },
        fitCanvas(canvasId?: string): void {
            record('fitCanvas', canvasId);
        },

        getScale: () => view.scale,
        getCentre: () => ({ ...view.centre }),
        getVisibleBounds: () => ({
            x: view.centre.x - view.container.width / 2 / view.scale,
            y: view.centre.y - view.container.height / 2 / view.scale,
            width: view.container.width / view.scale,
            height: view.container.height / view.scale,
        }),
        getContainerSize: () => ({ ...view.container }),

        // The same affine map the real renderer applies, and nothing else: the
        // canvas-space point at the viewport centre lands at the middle of the
        // surface, and one canvas-space unit is `scale` screen pixels.
        canvasToScreen: (point: ViewportPoint) => ({
            x:
                (point.x - view.centre.x) * view.scale +
                view.container.width / 2,
            y:
                (point.y - view.centre.y) * view.scale +
                view.container.height / 2,
        }),
        screenToCanvas: (point: ViewportPoint) => ({
            x:
                (point.x - view.container.width / 2) / view.scale +
                view.centre.x,
            y:
                (point.y - view.container.height / 2) / view.scale +
                view.centre.y,
        }),

        applyImageAdjustments(next: ImageAdjustments): void {
            record('applyImageAdjustments', next);
            adjustments = next;
        },

        onFrame(listener: () => void): () => void {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };

    return stub;
}
