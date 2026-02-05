<script lang="ts">
    import { getContext, untrack } from 'svelte';
    import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
    import X from 'phosphor-svelte/lib/X';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m } from '../state/i18n.svelte';
    import { SvelteSet } from 'svelte/reactivity';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    // We'll initialize from viewerState to preserve context.
    let searchQuery = $state('');

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

    // Total matches across all pages
    let totalMatches = $derived(
        viewerState.searchResults.reduce(
            (sum, group) => sum + group.hits.length,
            0,
        ),
    );

    // Track which canvas groups are expanded (by canvasIndex)
    let expandedGroups = new SvelteSet<number>();

    function toggleGroup(canvasIndex: number) {
        if (expandedGroups.has(canvasIndex)) {
            expandedGroups.delete(canvasIndex);
        } else {
            expandedGroups.add(canvasIndex);
        }
    }

    // Number of excerpts to show before collapse
    const INITIAL_EXCERPT_COUNT = 2;

    // Ref for the scrollable results container
    let resultsContainer = $state<HTMLElement | null>(null);

    // Auto-scroll active search result into view (e.g. on init when canvas is set via props)
    $effect(() => {
        if (!resultsContainer || viewerState.searchResults.length === 0) return;
        const idx = viewerState.currentCanvasIndex;
        if (idx < 0) return;
        const el = resultsContainer.querySelector(
            `[data-canvas-index="${idx}"]`,
        );
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
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
                    <X size={20} />
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
        <div
            bind:this={resultsContainer}
            class="flex-1 overflow-y-auto p-4 space-y-4"
        >
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
                        count: totalMatches,
                    })}
                </div>

                {#each viewerState.searchResults as group (group.canvasIndex)}
                    {@const isExpanded = expandedGroups.has(group.canvasIndex)}
                    {@const visibleHits = isExpanded
                        ? group.hits
                        : group.hits.slice(0, INITIAL_EXCERPT_COUNT)}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        data-canvas-index={group.canvasIndex}
                        class="w-full text-left bg-base-100 shadow-sm border border-base-200 rounded-box cursor-pointer hover:shadow-md transition-all block p-0 select-none {viewerState.currentCanvasIndex ===
                        group.canvasIndex
                            ? 'ring-2 ring-primary bg-primary/5'
                            : ''}"
                        onclick={() => navigate(group.canvasIndex)}
                        onkeydown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate(group.canvasIndex);
                            }
                        }}
                        role="button"
                        tabindex="0"
                    >
                        <div
                            class="text-sm font-bold opacity-80 bg-base-200/50 flex items-center justify-between py-2 px-3 border-b border-base-200"
                        >
                            <span>{group.canvasLabel}</span>
                            <span class="badge badge-sm badge-ghost"
                                >{group.hits.length}
                                {group.hits.length === 1
                                    ? 'result'
                                    : 'results'}</span
                            >
                        </div>
                        <div class="p-3 text-sm leading-relaxed">
                            {#each visibleHits as result, i (i)}{#if i > 0}<span
                                        class="text-primary mx-2">|</span
                                    >{/if}{#if result.type === 'hit'}<!-- eslint-disable-next-line svelte/no-at-html-tags --><span
                                        >{@html result.before}</span
                                    ><span
                                        class="bg-yellow-200 text-yellow-900 font-bold px-0.5 rounded"
                                        ><!-- eslint-disable-next-line svelte/no-at-html-tags -->{@html result.match}</span
                                    ><!-- eslint-disable-next-line svelte/no-at-html-tags --><span
                                        >{@html result.after}</span
                                    >{:else}<!-- eslint-disable-next-line svelte/no-at-html-tags --><span
                                        >{@html result.match}</span
                                    >{/if}{/each}{#if group.hits.length > INITIAL_EXCERPT_COUNT}
                                <button
                                    class="btn btn-ghost btn-xs text-primary ml-2"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        toggleGroup(group.canvasIndex);
                                    }}
                                >
                                    {isExpanded
                                        ? 'Show less'
                                        : `+${group.hits.length - INITIAL_EXCERPT_COUNT} more`}
                                </button>
                            {/if}
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
{/if}
