import type { ViewerState } from '../../state/viewer.svelte';
import type { AnnotationStore } from './AnnotationStore.svelte';

/**
 * Creates a reactive loader that syncs annotations from storage to the viewer's
 * read-only overlay. It runs independently of the Annotation Editor UI component
 * (the panel may never open), so it drives the shared store directly: point the
 * store at the current canvas and load — the store injects into `manifestsState`
 * (F10). When the editor panel is mounted, its manager shares this same store,
 * so both paths converge on one cache.
 */
export function createLoader(store: AnnotationStore) {
    return (viewerState: ViewerState) => {
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
            // annotations into the display overlay.
            store.setCanvas(manifestId, canvasId);
            void store.load().catch((err) => {
                console.error(
                    '[AnnotationLoader] Failed to load annotations',
                    err,
                );
            });
        });

        // The shared store's lifecycle is tied to the loader (which lives as long
        // as the plugin), not the editor panel. Clear its injected overlays and
        // release the adapter when the loader is torn down (F11).
        $effect(() => {
            return () => store.destroy();
        });
    };
}
