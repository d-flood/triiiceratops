<script lang="ts">
    /*
     * The plugin's mount root. Core owns the chrome: it renders the toolbar
     * button from the plugin metadata and the docked-panel / anchored-flyout
     * surface, and hands `view.mount` a content-only container. This wrapper
     * therefore renders ONLY
     * the panel content (the controller) — no toggle button, no `open` state, no
     * self-positioning. Open/close is owned by core, which places (and removes)
     * this content element in its surface.
     *
     * The heavy editing machinery (Annotorious via `AnnotationManager`) lives in
     * the controller; display sync (the read-only overlay) runs independently in
     * the loader (see `mount.svelte.ts`), so annotations stay visible regardless.
     */
    import AnnotationEditorController from './AnnotationEditorController.svelte';
    import type { AnnotationStore } from './AnnotationStore.svelte';
    import type { AnnotationEditorConfig } from './types';

    let {
        config,
        store,
        embedded = false,
    }: {
        config: AnnotationEditorConfig;
        store: AnnotationStore;
        embedded?: boolean;
    } = $props();
</script>

<AnnotationEditorController {config} {store} {embedded} />
