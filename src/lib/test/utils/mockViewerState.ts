/**
 * Mock ViewerState utility for testing
 */

import type { MockCanvas, MockManifest } from './mockManifesto';

/**
 * Create a simplified mock of ViewerState for testing
 * Note: This is not a full ViewerState, just enough for unit tests
 */
export function createMockViewerState(config: {
    manifestId?: string;
    canvasId?: string;
    canvases?: MockCanvas[];
    manifest?: MockManifest | null;
}) {
    const canvases = config.canvases || [];
    const manifestId = config.manifestId || null;
    const canvasId = config.canvasId || null;

    return {
        manifestId,
        canvasId,
        canvases,
        manifest: config.manifest || null,
        searchQuery: '',
        pendingSearchQuery: null,
        searchResults: [] as any[],
        isSearching: false,
        showSearchPanel: false,
        searchAnnotations: [] as any[],

        get currentCanvasIndex() {
            if (!canvasId) return -1;
            return canvases.findIndex((c) => c.id === canvasId);
        },

        get currentCanvasSearchAnnotations() {
            return this.searchAnnotations.filter(
                (a) => a.canvasId === canvasId,
            );
        },

        dispatchStateChange: () => {
            // No-op for tests
        },
    };
}
