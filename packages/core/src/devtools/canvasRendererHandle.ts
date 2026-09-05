/**
 * The `__triiiceratopsRenderer` handle the geometric e2e suite drives.
 *
 * NOT shipped: this directory is outside `src/lib` and is reached only from the
 * e2e harness page, so the element build never pulls it in. The
 * shaping lives here rather than in the renderer so that none of it reaches a
 * production bundle.
 *
 * It is not superseded by the public viewport API. What is here is the
 * renderer's own instrumentation — residency by canvas name, decoded bytes,
 * plan counts, metadata failures, which is how the renderer's claims are
 * asserted at all — plus a `setView` that adopts an exact viewport with no
 * easing, which no public command offers because programmatic input is always
 * animated (ADR 0015). Tests need a deterministic viewport rather than one
 * arrived at by synthesizing gestures.
 */
import type {
    RendererDevtoolsInstaller,
    RendererInternals,
} from '../lib/renderer/rendererDevtools';
import type { Point } from '../lib/renderer/types';

/**
 * How many settled paints this handle has seen, ever.
 *
 * **The out-of-process way to await a command**, and the reason it exists
 * rather than the promise every command below also returns. A promise returned
 * from an `evaluate` is awaited through CDP's `awaitPromise`, which holds it
 * WEAKLY — and the promise that hangs there is Playwright's own wrapper around
 * the call, which nothing in the page can name and therefore nothing can keep
 * alive. These commands provoke the largest allocations the renderer ever makes
 * (an 800-canvas world re-planned from one `setView`), so a garbage collection
 * lands inside the window between the call and the frame that settles it often
 * enough to matter. When it does, the awaiting call fails with CDP's
 * `Promise was collected`, which Playwright reports as "Execution context was
 * destroyed, most likely because of a navigation" — a message that sends the
 * investigation after a navigation that never happened.
 *
 * A caller that reads this before issuing a command and polls until it moves
 * transports no promise at all, and cannot be told that story. That is what
 * `tests/helpers/numberedGrid.ts` does for every command it drives.
 */
let settledPaintCount = 0;

/**
 * Resolve once a frame has been painted and the view has stopped moving.
 *
 * Every command below returns this rather than the frame itself, so an
 * assertion that follows an animated fit or zoom reads the settled viewport.
 * The frame hook fires after each paint and the motion flags are already
 * updated for the frame just drawn, so the first frame that reports stillness
 * is the settled one.
 *
 * Detach resolves it too: no frame follows detach, so a caller awaiting one
 * would otherwise hang for the rest of the page's life.
 */
function settledPaint(internals: RendererInternals): Promise<void> {
    return new Promise<void>((resolve) => {
        const settle = () => {
            off();
            offDetach();
            settledPaintCount += 1;
            resolve();
        };
        const off = internals.port.onFrame(() => {
            if (internals.isMoving()) return;
            settle();
        });
        const offDetach = internals.onDetach(settle);
        internals.requestFrame();
    });
}

export const installCanvasRendererHandle: RendererDevtoolsInstaller = (
    surface: HTMLCanvasElement,
    internals: RendererInternals,
) => {
    const nextPaint = () => settledPaint(internals);
    (
        surface as HTMLCanvasElement & { __triiiceratopsRenderer?: unknown }
    ).__triiiceratopsRenderer = {
        getView: () => {
            const viewport = internals.getViewport();
            return {
                centre: { ...viewport.centre },
                scale: viewport.scale,
                width: viewport.width,
                height: viewport.height,
                dpr: internals.getDpr(),
            };
        },
        setView: (view: { centre: Point; scale: number }) => {
            internals.setView(view);
            return nextPaint();
        },
        fit: () => {
            internals.fitWorld(true);
            return nextPaint();
        },
        zoomAt: (anchor: Point, factor: number) => {
            internals.port.zoomBy(factor, anchor);
            return nextPaint();
        },
        fitCanvasBounds: (
            bounds: { x: number; y: number; width: number; height: number },
            canvasId?: string,
        ) => {
            internals.port.fitBounds(bounds, canvasId);
            return nextPaint();
        },
        isMoving: () => internals.isMoving(),
        setBudget: (bytes: number) => {
            internals.setByteBudget(bytes);
            return nextPaint();
        },
        getStats: () => {
            const tiles = internals.tiles;
            return {
                residentTileCount: tiles.residentTileCount,
                cachedTileCount: tiles.cachedTileCount,
                decodedBytes: tiles.decodedBytes,
                requiredBytes: tiles.requiredBytes,
                byteBudget: tiles.byteBudget,
                tileRequestCount: tiles.requestCount,
                scenePlanCount: internals.getScenePlanCount(),
            };
        },
        getResidency: () => {
            const pyramid: string[] = [];
            const thumbnail: string[] = [];
            let boxCount = 0;
            for (const [canvasId, tier] of Object.entries(
                internals.getTiers(),
            )) {
                if (tier === 'pyramid') pyramid.push(canvasId);
                else if (tier === 'thumbnail') thumbnail.push(canvasId);
                else boxCount += 1;
            }
            return { pyramid, thumbnail, boxCount };
        },
        getCanvasErrors: () => ({ ...internals.canvasErrors }),
        registerPaintLayer: internals.registerPaintLayer,
        nextPaint,
        settledPaintCount: () => settledPaintCount,
    };
};
