/**
 * Cross-realm reactivity bridge for the plugin's Svelte UI.
 *
 * Core's `ViewerState` is compiled by CORE's Svelte runtime; when the plugin (its
 * OWN Svelte runtime) reads `viewerState.canvasId` inside an `$effect`, no
 * dependency is registered because the two reactivity graphs don't cross. The
 * plugin therefore mirrors the handful of fields its UI reacts to
 * (`manifestId`, `canvasId`) into plugin-runtime `$state`, kept in
 * sync through the framework-neutral `ViewerState.subscribe` fan-out. Every other
 * member/method (queries, display sync, the annotation-edit bus, the style root)
 * delegates straight to the real state, so a mirror is a drop-in `ViewerState`
 * for the controller, loader, manager, and store.
 */
import type { ViewerState } from 'triiiceratops';

export class ViewerStateMirror {
    #real: ViewerState;
    #unsubscribe: () => void;

    manifestId = $state<string | null>(null);
    canvasId = $state<string | null>(null);

    constructor(real: ViewerState) {
        this.#real = real;
        this.manifestId = real.manifestId;
        this.canvasId = real.canvasId;
        // Batched notifications carry no payload; re-read and gate each mirror
        // field so an unrelated change doesn't churn plugin reactivity.
        this.#unsubscribe = real.subscribe(() => {
            if (this.manifestId !== real.manifestId) {
                this.manifestId = real.manifestId;
            }
            if (this.canvasId !== real.canvasId) {
                this.canvasId = real.canvasId;
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

    /** Drop the bridge's `ViewerState.subscribe` registration. */
    destroy(): void {
        this.#unsubscribe();
    }
}

/** Build a mirror and expose it typed as a `ViewerState` for the plugin UI. */
export function createViewerStateMirror(real: ViewerState): {
    mirror: ViewerState;
    destroy: () => void;
} {
    const instance = new ViewerStateMirror(real);
    return {
        mirror: instance as unknown as ViewerState,
        destroy: () => instance.destroy(),
    };
}
