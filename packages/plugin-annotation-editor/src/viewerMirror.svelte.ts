/** Cross-realm bridge: mirrors reactive fields core's runtime cannot track. */
import type { PluginSurface } from '@triiiceratops/plugin-sdk';
import type { ViewerState } from 'triiiceratops';

export type MirroredViewerState = ViewerState & {
    readonly surfaceOpen: boolean;
};

export class ViewerStateMirror {
    #real: ViewerState;
    #unsubscribe: () => void;

    manifestId = $state<string | null>(null);
    canvasId = $state<string | null>(null);
    annotatableCanvasIds = $state.raw<string[]>([]);
    surfaceOpen = $state(false);

    constructor(real: ViewerState, surface: PluginSurface) {
        this.#real = real;
        this.manifestId = real.manifestId;
        this.canvasId = real.canvasId;
        this.annotatableCanvasIds = real.annotatableCanvasIds;
        this.surfaceOpen = surface.isOpen;
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

    get config(): ViewerState['config'] {
        return this.#real.config;
    }

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

    destroy(): void {
        this.#unsubscribe();
    }
}

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
