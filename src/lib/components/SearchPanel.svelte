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

    function navigate(canvasIndex: number) {
        const canvas = viewerState.canvases[canvasIndex];
        if (canvas) {
            viewerState.setCanvas(canvas.id);
        }
    }
    let width = $derived(viewerState.config.search?.width ?? '320px');
    let position = $derived(viewerState.config.search?.position ?? 'right');
</script>

<!-- Drawer / Panel -->
{#if viewerState.showSearchPanel}
    <div
        class="h-full bg-base-200 shadow-2xl z-100 flex flex-col transition-[width] duration-200 {viewerState
            .config.transparentBackground
            ? ''
            : position === 'left'
              ? 'border-r border-base-300'
              : 'border-l border-base-300'}"
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

                {#each viewerState.searchResults as group}
                    <button
                        class="w-full text-left bg-base-100 shadow-sm border border-base-200 rounded-box cursor-pointer hover:shadow-md transition-all block p-0 select-none"
                        onclick={() => navigate(group.canvasIndex)}
                    >
                        <div
                            class="text-sm font-bold opacity-80 bg-base-200/50 flex items-center justify-between py-2 px-3 border-b border-base-200"
                        >
                            <span>{group.canvasLabel}</span>
                            <span class="badge badge-sm badge-ghost"
                                >{group.hits.length}
                                {group.hits.length === 1
                                    ? 'match'
                                    : 'matches'}</span
                            >
                        </div>
                        <div class="p-0">
                            {#each group.hits.slice(0, 1) as result}
                                <div
                                    class="p-3 text-sm border-b border-base-200 last:border-none hover:bg-base-200/30 transition-colors"
                                >
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
                                            {@html result.match}
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </button>
                {/each}
            {/if}
        </div>
    </div>
{/if}
