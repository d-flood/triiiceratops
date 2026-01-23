// import type { PluginDef } from '../../types/plugin';
import type { ViewerState } from '../../state/viewer.svelte';
import type { AnnotationStorageAdapter } from './types';
// import { manifestsState } from '../../state/manifests.svelte';

/**
 * Creates a reactive loader that syncs annotations from the adapter to the viewer state.
 * This runs independently of the Annotation Editor UI component.
 */
export function createLoader(adapter: AnnotationStorageAdapter) {
    return (viewerState: ViewerState) => {
        // Track the last loaded combination to prevent duplicate loads
        // Although the adapter generally handles idempotency, this is a good optimization
        let lastLoadedId: string | null = null;

        $effect(() => {
            const manifestId = viewerState.manifestId;
            const canvasId = viewerState.canvasId;

            if (!manifestId || !canvasId) return;

            const comboId = `${manifestId}::${canvasId}`;
            if (comboId === lastLoadedId) return;

            // Update IMMEDIATELY to prevent re-entrant calls or rapid-fire effects
            lastLoadedId = comboId;

            // Load annotations for this canvas
            adapter
                .load(manifestId, canvasId)
                .then((_annotations) => {
                    // Success handling
                })
                .catch((err) => {
                    console.error(
                        '[AnnotationLoader] Failed to load annotations',
                        err,
                    );
                });
        });
    };
}
