<script lang="ts">
    import { getContext, untrack } from 'svelte';
    import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
    import Spinner from 'phosphor-svelte/lib/Spinner';
    import X from 'phosphor-svelte/lib/X';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m } from '../state/i18n.svelte';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    // We'll initialize from viewerState to preserve context.
    let searchQuery = $state('');
    let resultsContainer: HTMLElement;

    let showCloseButton = $derived(
        viewerState.config.search?.showCloseButton ?? true,
    );

    // Sync local query with viewerState
    $effect(() => {
        if (viewerState.searchQuery !== untrack(() => searchQuery)) {
            searchQuery = viewerState.searchQuery;
        }
    });

    function handleSearch() {
        viewerState.search(searchQuery);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    }

    function navigate(result: any) {
        const canvas = viewerState.canvases[result.canvasIndex];
        if (canvas) {
            viewerState.setCanvas(canvas.id);
        }
    }
    let width = $derived(viewerState.config.search?.width ?? '320px');
</script>

<!-- Drawer / Panel -->
{#if viewerState.showSearchPanel}
    <div
        class="h-full bg-base-200 shadow-2xl z-100 flex flex-col border-l border-base-300 transition-[width] duration-200"
        style="width: {width}"
        role="dialog"
        aria-label={m.search_panel_title()}
    >
        <!-- Header -->
        <div
            class="flex items-center justify-between p-4 border-b border-base-300"
        >
            <h2 class="font-bold text-lg">{m.search()}</h2>
            {#if showCloseButton}
                <button
                    class="btn btn-sm btn-circle btn-ghost"
                    onclick={() => viewerState.toggleSearchPanel()}
                    aria-label={m.close_search()}
                >
                    <X size={20} weight="bold" />
                </button>
            {/if}
        </div>

        <!-- Search Input -->
        <div class="p-4 border-b border-base-300 shrink-0">
            <div class="relative w-full">
                <input
                    type="text"
                    bind:value={searchQuery}
                    onkeydown={handleKeydown}
                    placeholder={m.search_panel_placeholder()}
                    class="input input-bordered w-full pr-12"
                />
                <button
                    class="btn btn-primary absolute right-0 top-0 h-full rounded-l-none"
                    onclick={handleSearch}
                    aria-label={m.search_panel_title()}
                >
                    {#if viewerState.isSearching}
                        <span class="loading loading-spinner loading-xs"></span>
                    {:else}
                        <MagnifyingGlass size={20} weight="bold" />
                    {/if}
                </button>
            </div>
        </div>

        <!-- Results -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
            {#if viewerState.isSearching}
                <div class="flex justify-center p-8">
                    <span
                        class="loading loading-spinner loading-lg text-primary"
                    ></span>
                </div>
            {:else if viewerState.searchResults.length === 0 && viewerState.searchQuery}
                <div class="text-center opacity-50 p-4">
                    {m.search_panel_no_results({
                        query: viewerState.searchQuery,
                    })}
                </div>
            {:else if viewerState.searchResults.length === 0 && !viewerState.searchQuery}
                <div class="text-center opacity-50 p-4 text-sm">
                    {m.search_panel_instruction()}
                </div>
            {:else}
                <!-- Results Header -->
                <div
                    class="text-xs font-bold opacity-50 uppercase tracking-wider pb-2"
                >
                    {m.search_panel_results_count({
                        count: viewerState.searchResults.length,
                    })}
                </div>

                {#each viewerState.searchResults as result, i}
                    <button
                        class="w-full text-left card bg-base-100 shadow hover:shadow-md transition-all p-4 text-sm group border border-transparent hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                        onclick={() => navigate(result)}
                    >
                        <div class="flex justify-between items-baseline mb-1">
                            <span
                                class="font-bold text-xs opacity-70 bg-base-200 px-1.5 py-0.5 rounded"
                                >{result.canvasLabel}</span
                            >
                        </div>

                        {#if result.type === 'hit'}
                            <div class="leading-relaxed">
                                <span>{@html result.before}</span>
                                <span
                                    class="bg-yellow-200 text-yellow-900 font-bold px-0.5 rounded"
                                    >{@html result.match}</span
                                >
                                <span>{@html result.after}</span>
                            </div>
                        {:else}
                            <div class="leading-relaxed">
                                {result.match}
                            </div>
                        {/if}
                    </button>
                {/each}
            {/if}
        </div>
    </div>
{/if}
