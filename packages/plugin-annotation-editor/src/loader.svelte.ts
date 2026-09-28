import type { ViewerState } from 'triiiceratops';
import type { AnnotationStore } from './AnnotationStore.svelte';

export function createLoader(store: AnnotationStore) {
    return (viewerState: ViewerState) => {
        store.setDisplayState(viewerState);

        let lastLoadedId: string | null = null;

        $effect(() => {
            const manifestId = viewerState.manifestId;
            const canvasId = viewerState.canvasId;

            if (!manifestId || !canvasId) return;

            const comboId = `${manifestId}::${canvasId}`;
            if (comboId === lastLoadedId) return;

            lastLoadedId = comboId;

            store.setCanvas(manifestId, canvasId);
            void store.load();
        });

        $effect(() => {
            return () => store.destroy();
        });
    };
}
