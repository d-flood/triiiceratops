import type { ViewerState } from 'triiiceratops';
import type { AnnotationStore } from './AnnotationStore.svelte';

/**
 * Creates a reactive loader that syncs annotations from storage to the viewer's
 * read-only overlay. It runs independently of the Annotation Editor UI component
 * (the panel may never open), so it drives the shared store directly: point the
 * store at the current canvas and load; the store injects into this viewer's
 * per-viewer display state (F10, ADR 0007). When the editor panel is mounted,
 * its manager shares this same store, so both paths converge on one cache.
 */
export function createLoader(store: AnnotationStore) {
    return (viewerState: ViewerState) => {
        // Display sync targets this owning viewer instance's display state, not
        // the page-shared manifest cache (ADR 0001, amended).
        store.setDisplayState(viewerState);

        // Track the last loaded combination to prevent duplicate loads.
        let lastLoadedId: string | null = null;

        $effect(() => {
            const manifestId = viewerState.manifestId;
            const canvasId = viewerState.canvasId;

            if (!manifestId || !canvasId) return;

            const comboId = `${manifestId}::${canvasId}`;
            if (comboId === lastLoadedId) return;

            // Update IMMEDIATELY to prevent re-entrant calls or rapid-fire effects
            lastLoadedId = comboId;

            // Point the shared store at this canvas, then load. The store's
            // load-race token discards stale results and it injects the loaded
            // annotations into the display overlay. A load failure is reported
            // by the store itself on its structured channel (`onPersistenceError`
            // / panel error, F20); `load()` catches internally and never rejects,
            // so there is nothing to handle — and nothing to log — here.
            store.setCanvas(manifestId, canvasId);
            void store.load();
        });

        // The shared store's lifecycle is tied to the loader (which lives as long
        // as the plugin), not the editor panel. Clear its injected overlays and
        // release the adapter when the loader is torn down (F11).
        $effect(() => {
            return () => store.destroy();
        });
    };
}
