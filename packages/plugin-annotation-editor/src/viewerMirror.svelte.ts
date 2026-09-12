/**
 * Cross-realm reactivity bridge for the plugin's Svelte UI.
 *
 * Core's `ViewerState` is compiled by CORE's Svelte runtime; when the plugin (its
 * OWN Svelte runtime) reads `viewerState.canvasId` inside an `$effect`, no
 * dependency is registered because the two reactivity graphs don't cross. The
 * plugin therefore mirrors the handful of fields its UI reacts to
 * (`manifestId`, `canvasId`, `annotatableCanvasIds`, `surfaceOpen`) into
 * plugin-runtime `$state`, kept in
 * sync through the framework-neutral `ViewerState.subscribe` fan-out. Every other
 * member/method (queries, display sync, the annotation-edit bus, the style root)
 * delegates straight to the real state, so a mirror is a drop-in `ViewerState`
 * for the controller, loader, drawing layer, and store.
 */
import type { PluginSurface } from '@triiiceratops/plugin-sdk';
import type { ViewerState } from 'triiiceratops';

/**
 * The mirror as the plugin's UI consumes it: core's `ViewerState`, plus the
 * mirrored fields core has no `ViewerState` member for.
 */
export type MirroredViewerState = ViewerState & {
    readonly surfaceOpen: boolean;
};

export class ViewerStateMirror {
    #real: ViewerState;
    #unsubscribe: () => void;

    manifestId = $state<string | null>(null);
    canvasId = $state<string | null>(null);
    /**
     * Raw rather than deeply reactive: core replaces the array wholesale, and a
     * `$state` proxy would never compare equal to the source's own reference,
     * so the gate below could not tell an unchanged list from a new one. Core
     * keeps that reference stable while the ids are unchanged.
     */
    annotatableCanvasIds = $state.raw<string[]>([]);
    /**
     * Whether this plugin's own panel/flyout is open — the signal core names as
     * the way a plugin observes open/close, since it mounts the plugin's
     * content once per ACTIVATION and only re-parents it in and out of the
     * surface, so a close destroys no component. It is not a `ViewerState`
     * member: it reads off `PluginContext.surface`, which is a live projection
     * over the viewer's plugin UI state, and every mutator of that state
     * notifies through the same fan-out as the fields above.
     */
    surfaceOpen = $state(false);

    constructor(real: ViewerState, surface: PluginSurface) {
        this.#real = real;
        this.manifestId = real.manifestId;
        this.canvasId = real.canvasId;
        this.annotatableCanvasIds = real.annotatableCanvasIds;
        this.surfaceOpen = surface.isOpen;
        // Batched notifications carry no payload; re-read and gate each mirror
        // field so an unrelated change doesn't churn plugin reactivity.
        this.#unsubscribe = real.subscribe(() => {
            if (this.manifestId !== real.manifestId) {
                this.manifestId = real.manifestId;
            }
            if (this.canvasId !== real.canvasId) {
                this.canvasId = real.canvasId;
            }
            if (this.annotatableCanvasIds !== real.annotatableCanvasIds) {
                this.annotatableCanvasIds = real.annotatableCanvasIds;
            }
            if (this.surfaceOpen !== surface.isOpen) {
                this.surfaceOpen = surface.isOpen;
            }
        });
    }

    /** The per-viewer annotation-edit bus (mutated in place by the controller). */
    get annotationEditBus(): ViewerState['annotationEditBus'] {
        return this.#real.annotationEditBus;
    }

    getCanvases(manifestId: string, sequenceIndex?: number): unknown[] {
        return this.#real.getCanvases(manifestId, sequenceIndex);
    }

    getUserAnnotations(manifestId: string, canvasId: string): unknown[] {
        return this.#real.getUserAnnotations(manifestId, canvasId);
    }

    setUserAnnotations(
        manifestId: string,
        canvasId: string,
        annotations: unknown[],
    ): void {
        this.#real.setUserAnnotations(
            manifestId,
            canvasId,
            annotations as Parameters<ViewerState['setUserAnnotations']>[2],
        );
    }

    clearUserAnnotations(manifestId: string, canvasId: string): void {
        this.#real.clearUserAnnotations(manifestId, canvasId);
    }

    getStyleRoot(): Document | ShadowRoot | null {
        return this.#real.getStyleRoot();
    }

    /*
     * The renderer's coordinate queries, delegated rather than mirrored. They
     * answer from the live viewport, which moves every frame, so a mirrored copy
     * would be stale the moment it was read; the drawing layer reprojects on
     * `subscribeFrame` instead.
     */

    /**
     * The owning viewer's config. Read for `pointStyle`, which core's read-only
     * overlay resolves its own point marker from — the editor has to answer
     * from the same object or a point changes size the moment it is selected.
     */
    get config(): ViewerState['config'] {
        return this.#real.config;
    }

    /**
     * The canvas-space box the viewport shows. The keyboard's place-then-shape
     * creation reads it to put a default shape at the centre of the view.
     */
    get viewportBounds(): ViewerState['viewportBounds'] {
        return this.#real.viewportBounds;
    }

    canvasSize(canvasId?: string): ReturnType<ViewerState['canvasSize']> {
        return this.#real.canvasSize(canvasId);
    }

    canvasToScreen(
        point: Parameters<ViewerState['canvasToScreen']>[0],
        canvasId?: string,
    ): ReturnType<ViewerState['canvasToScreen']> {
        return this.#real.canvasToScreen(point, canvasId);
    }

    screenToCanvas(
        point: Parameters<ViewerState['screenToCanvas']>[0],
        canvasId?: string,
    ): ReturnType<ViewerState['screenToCanvas']> {
        return this.#real.screenToCanvas(point, canvasId);
    }

    subscribeFrame(listener: () => void): () => void {
        return this.#real.subscribeFrame(listener);
    }

    /** Drop the bridge's `ViewerState.subscribe` registration. */
    destroy(): void {
        this.#unsubscribe();
    }
}

/** Build a mirror and expose it as a `ViewerState` for the plugin UI. */
export function createViewerStateMirror(
    real: ViewerState,
    surface: PluginSurface,
): {
    mirror: MirroredViewerState;
    destroy: () => void;
} {
    const instance = new ViewerStateMirror(real, surface);
    return {
        mirror: instance as unknown as MirroredViewerState,
        destroy: () => instance.destroy(),
    };
}
