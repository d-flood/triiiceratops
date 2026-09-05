/**
 * The hook a development build uses to install renderer instrumentation.
 *
 * The geometric e2e assertions need a deterministic viewport and the renderer's
 * own counters — residency by canvas, decoded bytes, plan counts, metadata
 * failures — which no public command offers and which ADR 0012 keeps off the
 * plugin surface deliberately. The instrumentation itself lives in
 * `src/devtools/`, which the element build never reaches: the dev entry
 * (`src/main.ts`) registers an installer here, and the renderer calls it if
 * one is present. With no installer registered — every production build — the
 * renderer's thunk is never called and the instrumentation is not in the graph
 * at all.
 *
 * {@link RendererInternals} is deliberately raw: live handles and one-line
 * accessors for state the renderer holds in closure variables, and nothing
 * that could be derived from them. Every shaped value the handle publishes —
 * the stats record, the residency split, a settled-paint promise — is composed
 * in `src/devtools/`, so none of that shaping ships.
 *
 * A bundler-provided DEV flag would have been the obvious gate and is not
 * available: `distribution-cleanup.guard.test.ts` bans build-time environment
 * conditionals from shipped source, so the published Svelte compiles under a
 * consumer bundler that defines none.
 */
import type { CanvasErrorKind } from './canvasErrors';
import type { RendererPort } from './rendererPort';
import type { TileScheduler } from './tileScheduler';
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
    /**
     * Ask for a frame from outside the frame loop. Paired with
     * `port.onFrame` to build the settled-paint promise the e2e suite awaits.
     */
    requestFrame(): void;
    /**
     * Run `fn` when the renderer detaches, before its frame listeners are
     * dropped. A promise waiting on a frame must settle here: after detach no
     * further frame is emitted, so anything still awaiting one would never
     * resolve. Returns an unregister function.
     */
    onDetach(fn: () => void): () => void;
    setByteBudget(bytes: number): void;
    /** The tile scheduler itself, which carries every residency counter. */
    tiles: TileScheduler;
    getScenePlanCount(): number;
    getTiers(): Record<string, ResidencyTier>;
    /** Live and reactive; the handle copies it before publishing. */
    canvasErrors: Record<string, CanvasErrorKind>;
    registerPaintLayer: (layer: never) => () => void;
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

/**
 * Called by the renderer on attach. A no-op unless a dev entry registered an
 * installer, in which case the renderer's thunk is called for its internals.
 */
export function installRendererDevtools(
    surface: HTMLCanvasElement,
    getInternals: () => RendererInternals,
): void {
    if (installer) installer(surface, getInternals());
}
