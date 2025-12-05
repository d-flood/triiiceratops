import { manifestsState } from './manifests.svelte.js';

export class ViewerState {
    manifestId: string | null = $state(null);
    canvasId: string | null = $state(null);
    showAnnotations = $state(true);

    constructor(initialManifestId?: string | null) {
        this.manifestId = initialManifestId || null;
        // Fetch manifest immediately
        if (this.manifestId) {
            manifestsState.fetchManifest(this.manifestId);
        }
    }

    get manifest() {
        if (!this.manifestId) return null;
        return manifestsState.getManifest(this.manifestId);
    }

    get canvases() {
        if (!this.manifestId) return [];
        const canvases = manifestsState.getCanvases(this.manifestId);

        // Auto-initialize canvasId to first canvas if not set
        if (canvases.length > 0 && !this.canvasId) {
            // Use setTimeout to avoid updating state during a derived computation
            setTimeout(() => {
                if (!this.canvasId && canvases.length > 0) {
                    this.canvasId = canvases[0].id;
                }
            }, 0);
        }

        return canvases;
    }

    get currentCanvasIndex() {
        if (!this.canvasId) {
            if (this.canvases.length > 0) return 0;
            return -1;
        }
        // Manifesto canvases have an id property
        return this.canvases.findIndex((c: any) => c.id === this.canvasId);
    }

    get hasNext() {
        return this.currentCanvasIndex < this.canvases.length - 1;
    }

    get hasPrevious() {
        return this.currentCanvasIndex > 0;
    }

    nextCanvas() {
        if (this.hasNext) {
            const nextIndex = this.currentCanvasIndex + 1;
            const canvas = this.canvases[nextIndex];
            this.canvasId = canvas.id;
        }
    }

    previousCanvas() {
        if (this.hasPrevious) {
            const prevIndex = this.currentCanvasIndex - 1;
            const canvas = this.canvases[prevIndex];
            this.canvasId = canvas.id;
        }
    }

    setManifest(manifestId: string) {
        this.manifestId = manifestId;
        this.canvasId = null;
        manifestsState.fetchManifest(manifestId);
    }

    toggleAnnotations() {
        this.showAnnotations = !this.showAnnotations;
    }
}

// Create a singleton instance, though we could also instantiate it in App or MiradorViewer
export const viewerState = new ViewerState();
