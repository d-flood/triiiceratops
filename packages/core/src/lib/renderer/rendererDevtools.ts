/**
 * The hook a development build uses to install renderer instrumentation.
 *
 * The geometric e2e assertions need a deterministic viewport and the renderer's
 * own counters — residency by canvas, decoded bytes, plan counts, metadata
 * failures — which no public command offers and which ADR 0012 keeps off the
 * plugin surface deliberately. That instrumentation used to be built inside the
 * renderer, so ~154 lines of test-only shaping shipped in every bundle.
 *
 * It now lives in `src/devtools/`, which the element build never reaches: the
 * dev entry (`src/main.ts`) registers an installer here, and the renderer calls
 * it if one is present. With no installer registered — every production build —
 * this is a null check and the instrumentation is not in the graph at all.
 *
 * A bundler-provided DEV flag would have been the obvious gate and is not
 * available: `distribution-cleanup.guard.test.ts` bans build-time environment
 * conditionals from shipped source, so the published Svelte compiles under a
 * consumer bundler that defines none.
 */
import type { CanvasErrorKind } from './canvasErrors';
import type { RendererPort } from './rendererPort';
import type { Point, ResidencyTier, Viewport } from './types';

/** The renderer internals the instrumentation is built from. */
export interface RendererInternals {
    getViewport(): Viewport;
    /** Adopt an exact viewport with no easing — no public command does this. */
    setView(view: { centre: Point; scale: number }): void;
    getDpr(): number;
    isMoving(): boolean;
    /**
     * Fit what is ON SCREEN — the `0`/`Home` binding. Deliberately not the
     * public `fitCanvas`, which fits the canvas the viewer says is current;
     * the split is load-bearing in continuous mode.
     */
    fitWorld(animated: boolean): void;
    port: RendererPort;
    setByteBudget(bytes: number): void;
    getStats(): {
        residentTileCount: number;
        cachedTileCount: number;
        decodedBytes: number;
        requiredBytes: number;
        byteBudget: number;
        tileRequestCount: number;
        scenePlanCount: number;
    };
    getTiers(): Record<string, ResidencyTier>;
    getCanvasErrors(): Record<string, CanvasErrorKind>;
    registerPaintLayer: (layer: never) => () => void;
    nextPaint(): Promise<void>;
}

export type RendererDevtoolsInstaller = (
    surface: HTMLCanvasElement,
    internals: RendererInternals,
) => void;

let installer: RendererDevtoolsInstaller | null = null;

/** Called by the dev entry only. */
export function setRendererDevtools(fn: RendererDevtoolsInstaller): void {
    installer = fn;
}

/** Called by the renderer on attach. A no-op unless a dev entry registered one. */
export function installRendererDevtools(
    surface: HTMLCanvasElement,
    internals: RendererInternals,
): void {
    installer?.(surface, internals);
}
