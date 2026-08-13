/**
 * The `__triiiceratopsRenderer` handle the geometric e2e suite drives.
 *
 * NOT shipped: this directory is outside `src/lib` and is reached only from
 * `src/main.ts`, the dev entry, so the element build never pulls it in. It used
 * to live inside the renderer, which put ~154 lines of test-only shaping into
 * every production bundle.
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

export const installCanvasRendererHandle: RendererDevtoolsInstaller = (
    surface: HTMLCanvasElement,
    internals: RendererInternals,
) => {
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
            return internals.nextPaint();
        },
        fit: () => {
            internals.fitWorld(true);
            return internals.nextPaint();
        },
        zoomAt: (anchor: Point, factor: number) => {
            internals.port.zoomBy(factor, anchor);
            return internals.nextPaint();
        },
        fitCanvasBounds: (
            bounds: { x: number; y: number; width: number; height: number },
            canvasId?: string,
        ) => {
            internals.port.fitBounds(bounds, canvasId);
            return internals.nextPaint();
        },
        isMoving: () => internals.isMoving(),
        setBudget: (bytes: number) => {
            internals.setByteBudget(bytes);
            return internals.nextPaint();
        },
        getStats: () => internals.getStats(),
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
        getCanvasErrors: () => internals.getCanvasErrors(),
        registerPaintLayer: internals.registerPaintLayer,
        nextPaint: internals.nextPaint,
    };
};
