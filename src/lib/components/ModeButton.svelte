<script lang="ts">
    import { getContext } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m, language } from '../state/i18n.svelte';
    import { Book, BookOpen } from 'phosphor-svelte';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    function toggleMode() {
        viewerState.toggleTwoPageMode();
    }

    const modeTooltip = viewerState.twoPageMode
            ? 'Switch to Single Page Mode'
            : 'Switch to Two Page Mode'
</script>
{#if viewerState.showModeToggle}
    <div
        class="absolute left-6 top-6 z-50 pointer-events-auto flex flex-col items-start transition-all duration-300"
    >
        <button
            class="bg-white dark:bg-gray-800 p-2 rounded-md shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            on:click={toggleMode}
            aria-label={modeTooltip}
            title={modeTooltip}>
            {#if viewerState.twoPageMode}
                <Book size={24} />
            {:else}
                <BookOpen size={24} />
            {/if}
        </button>
            
    </div>
{/if}
