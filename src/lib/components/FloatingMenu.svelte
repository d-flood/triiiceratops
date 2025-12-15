<script lang="ts">
    import { getContext } from 'svelte';
    import ChatCenteredText from 'phosphor-svelte/lib/ChatCenteredText';
    import CornersIn from 'phosphor-svelte/lib/CornersIn';
    import CornersOut from 'phosphor-svelte/lib/CornersOut';
    import Info from 'phosphor-svelte/lib/Info';
    import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
    import List from 'phosphor-svelte/lib/List';
    import Slideshow from 'phosphor-svelte/lib/Slideshow';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m } from '../state/i18n.svelte';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
</script>

<div
    class="fab fab-flower fab-top-left absolute z-600 pointer-events-auto flex-col items-end transition-all duration-300 bottom-6 right-6"
>
    <div class="tooltip tooltip-left" data-tip={m.menu()}>
        <div
            tabindex="0"
            role="button"
            class="btn btn-lg btn-primary btn-circle shadow-xl"
        >
            <span class="sr-only">{m.menu()}</span>
            <List size={32} weight="bold" />
        </div>
    </div>
    <!-- a focusable div with tabindex is necessary to work on all browsers. role="button" is necessary for accessibility -->

    <!-- Main Action button replaces the original button when FAB is open -->
    <div class="fab-close tooltip tooltip-top" data-tip={m.search()}>
        <button
            aria-label={m.toggle_search()}
            class={[
                'btn btn-circle btn-lg shadow-lg',
                viewerState.showSearchPanel && 'btn-primary',
                !viewerState.showSearchPanel && 'btn-neutral',
            ]}
            onclick={() => viewerState.toggleSearchPanel()}
        >
            <MagnifyingGlass size={28} weight="bold" />
        </button>
    </div>

    <!-- buttons that show up when FAB is open -->

    <!-- Gallery Toggle -->
    <div
        class="tooltip tooltip-left"
        data-tip={viewerState.showThumbnailGallery
            ? m.hide_gallery()
            : m.show_gallery()}
    >
        <button
            aria-label={viewerState.showThumbnailGallery
                ? m.hide_gallery()
                : m.show_gallery()}
            class="btn btn-lg btn-circle shadow-lg {viewerState.showThumbnailGallery
                ? 'btn-info'
                : 'btn-neutral'}"
            onclick={() => viewerState.toggleThumbnailGallery()}
        >
            <Slideshow size={28} weight="bold" />
        </button>
    </div>

    <!-- Full Screen Toggle -->
    <div
        class="tooltip tooltip-left"
        data-tip={viewerState.isFullScreen
            ? m.exit_full_screen()
            : m.enter_full_screen()}
    >
        <button
            class="btn btn-circle btn-lg shadow-lg transition-all duration-300 ease-out {viewerState.isFullScreen
                ? 'btn-warning'
                : 'btn-neutral'}"
            onclick={() => viewerState.toggleFullScreen()}
        >
            {#if viewerState.isFullScreen}
                <CornersIn size={28} weight="bold" />
            {:else}
                <CornersOut size={28} weight="bold" />
            {/if}
        </button>
    </div>

    <!-- Annotations Toggle -->
    <div
        class="tooltip tooltip-top"
        data-tip={viewerState.showAnnotations
            ? m.hide_annotations()
            : m.show_annotations()}
    >
        <button
            aria-label={m.toggle_annotations()}
            class="btn btn-lg btn-circle shadow-lg {viewerState.showAnnotations
                ? 'btn-error'
                : 'btn-neutral'}"
            onclick={() => viewerState.toggleAnnotations()}
        >
            <ChatCenteredText size={28} weight="bold" />
        </button>
    </div>

    <!-- Metadata Toggle -->
    <div class="tooltip tooltip-top" data-tip={m.metadata()}>
        <button
            aria-label={m.toggle_metadata()}
            class="btn btn-lg btn-circle shadow-lg {viewerState.showMetadataDialog
                ? 'btn-info'
                : 'btn-neutral'}"
            onclick={() => viewerState.toggleMetadataDialog()}
        >
            <Info size={28} weight="bold" />
        </button>
    </div>
</div>
