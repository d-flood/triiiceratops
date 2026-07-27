<script lang="ts">
    /*
     * The plugin's mount root. Core owns the container; this component renders the
     * self-contained chrome (a toolbar toggle button + a docked panel) since SDK
     * plugins no longer plug into core's Toolbar/PanelStack. The heavy editing
     * machinery (Annotorious via `AnnotationManager`) lives in the controller,
     * which is mounted only while the panel is open — display sync (the read-only
     * overlay) runs independently in the loader, so annotations stay visible when
     * the panel is closed.
     */
    import AnnotationEditorController from './AnnotationEditorController.svelte';
    import { GLYPHS, VIEW_BOX } from './icons';
    import { useT } from './i18n.svelte';
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

    const t = useT();
    // The panel is closed until the user opens it from the toggle; display sync
    // (the read-only overlay) runs regardless in the loader. `startInCreateMode`
    // affects the controller's mode once opened, not whether the panel is open.
    let open = $state(false);
</script>

<div class="tri-ae" data-tri-ae>
    <!-- Dock first so the toggle (below) stacks on top of the open panel. -->
    {#if open}
        <div class="tri-ae-dock" data-tri-ae-panel>
            <AnnotationEditorController {config} {store} {embedded} />
        </div>
    {/if}

    <button
        type="button"
        class="tri-ae-toggle"
        data-tri-ae-toggle
        aria-expanded={open}
        aria-label={t('annotation_editor_title')}
        title={t('annotation_editor_title')}
        onclick={() => (open = !open)}
    >
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <svg viewBox={VIEW_BOX} aria-hidden="true" focusable="false"
            >{@html GLYPHS.PencilSimple}</svg
        >
    </button>
</div>
