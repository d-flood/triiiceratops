<script lang="ts">
    import { getContext, untrack } from 'svelte';
    import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m } from '../state/i18n.svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { getCanvasId } from './viewerControls';
    import { Button, TextInput, Badge, Spinner } from './ui';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    let { embedded = false }: { embedded?: boolean } = $props();

    // We'll initialize from viewerState to preserve context.
    let searchQuery = $state('');

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
        const canvasId = getCanvasId(canvas);
        if (canvasId) {
            viewerState.setCanvas(canvasId);
        }
    }
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
        data-panel-id="search"
        class="panel"
        class:standalone={!embedded}
        class:bordered-left={!embedded &&
            !viewerState.config.transparentBackground &&
            position === 'left'}
        class:bordered-right={!embedded &&
            !viewerState.config.transparentBackground &&
            position !== 'left'}
        role="dialog"
        aria-label={m.search_panel_title()}
    >
        {#if !embedded}
            <div class="header">
                <h2 class="title">{m.search()}</h2>
            </div>
        {/if}

        <!-- Search Input -->
        <div class="search-bar">
            <div class="search-input-wrap">
                <TextInput
                    bind:value={searchQuery}
                    onkeydown={handleKeydown}
                    placeholder={m.search_panel_placeholder()}
                    class="search-input"
                />
                <Button
                    variant="primary"
                    class="search-button"
                    onclick={handleSearch}
                    aria-label={m.search_panel_title()}
                >
                    {#if viewerState.isSearching}
                        <Spinner size="xs" />
                    {:else}
                        <MagnifyingGlass size={20} weight="bold" />
                    {/if}
                </Button>
            </div>
        </div>

        <!-- Results -->
        <div
            bind:this={resultsContainer}
            class="results"
            class:scrollable={!embedded}
        >
            {#if viewerState.isSearching}
                <div class="loading-wrap">
                    <Spinner size="lg" class="loading-primary" />
                </div>
            {:else if viewerState.searchResults.length === 0 && viewerState.searchQuery}
                <div class="empty">
                    {m.search_panel_no_results({
                        query: viewerState.searchQuery,
                    })}
                </div>
            {:else if viewerState.searchResults.length === 0 && !viewerState.searchQuery}
                <div class="empty empty-instruction">
                    {m.search_panel_instruction()}
                </div>
            {:else}
                <!-- Results Header -->
                <div class="results-count">
                    {m.search_panel_results_count({
                        count: totalMatches,
                    })}
                </div>

                {#each viewerState.searchResults as group (group.canvasIndex)}
                    {@const isExpanded = expandedGroups.has(group.canvasIndex)}
                    {@const visibleHits = isExpanded
                        ? group.hits
                        : group.hits.slice(0, INITIAL_EXCERPT_COUNT)}
                    <div
                        data-canvas-index={group.canvasIndex}
                        class="group"
                        class:current={viewerState.currentCanvasIndex ===
                            group.canvasIndex}
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
                        <div class="group-header">
                            <span>{group.canvasLabel}</span>
                            <Badge size="sm" style="--badge-color:var(--panel-surface);"
                                >{group.hits.length}
                                {group.hits.length === 1
                                    ? 'result'
                                    : 'results'}</Badge
                            >
                        </div>
                        <div class="excerpts">
                            {#each visibleHits as result, i (i)}{#if i > 0}<span
                                        class="separator">|</span
                                    >{/if}{#if result.type === 'hit'}<!-- eslint-disable-next-line svelte/no-at-html-tags --><span
                                        >{@html result.before}</span
                                    ><span
                                        class="match"
                                    >
                                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                        {@html result.match}
                                    </span><!-- eslint-disable-next-line svelte/no-at-html-tags --><span
                                        >{@html result.after}</span
                                    >{:else}<!-- eslint-disable-next-line svelte/no-at-html-tags --><span
                                        >{@html result.match}</span
                                    >{/if}{/each}{#if group.hits.length > INITIAL_EXCERPT_COUNT}
                                <Button
                                    ghost
                                    size="xs"
                                    class="show-more"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        toggleGroup(group.canvasIndex);
                                    }}
                                >
                                    {isExpanded
                                        ? 'Show less'
                                        : `+${group.hits.length - INITIAL_EXCERPT_COUNT} more`}
                                </Button>
                            {/if}
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
{/if}

<style>
    .panel {
        min-height: 0;
        display: flex;
        flex-direction: column;
    }
    .panel.standalone {
        height: 100%;
        background-color: var(--panel-surface);
        box-shadow: 0 25px 50px -12px #00000040;
        z-index: 100;
        transition-property: width;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.2s;
    }
    .panel.bordered-left {
        border-right-width: 1px;
        border-right-style: solid;
        border-right-color: var(--surface-border);
    }
    .panel.bordered-right {
        border-left-width: 1px;
        border-left-style: solid;
        border-left-color: var(--surface-border);
    }

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--surface-border);
    }
    .title {
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.75rem;
    }

    .search-bar {
        padding: 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--surface-border);
        flex-shrink: 0;
    }
    .search-input-wrap {
        position: relative;
        width: 100%;
    }
    .search-input-wrap :global(.search-input) {
        width: 100%;
        padding-right: 3rem;
    }
    .search-input-wrap :global(.search-button) {
        position: absolute;
        right: 0;
        top: 0;
        height: 100%;
        border-start-start-radius: 0;
        border-end-start-radius: 0;
    }

    .results {
        padding: 1rem;
    }
    .results > * + * {
        margin-top: 1rem;
    }
    .results.scrollable {
        flex: 1 1 0%;
        overflow-y: auto;
    }

    .loading-wrap {
        display: flex;
        justify-content: center;
        padding: 2rem;
    }
    .loading-wrap :global(.loading-primary) {
        color: var(--color-primary);
    }

    .empty {
        text-align: center;
        opacity: 0.5;
        padding: 1rem;
    }
    .empty-instruction {
        font-size: 0.875rem;
        line-height: 1.25rem;
    }

    .results-count {
        font-size: 0.75rem;
        line-height: 1rem;
        font-weight: 700;
        opacity: 0.5;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding-bottom: 0.5rem;
    }

    .group {
        width: 100%;
        text-align: left;
        background-color: var(--input-bg);
        box-shadow:
            0 1px 3px 0 #0000001a,
            0 1px 2px -1px #0000001a;
        border-width: 1px;
        border-style: solid;
        border-color: var(--panel-surface);
        border-radius: var(--radius-panels);
        cursor: pointer;
        transition-property: all;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
        display: block;
        padding: 0;
    }
    .group.current {
        box-shadow:
            0 0 0 2px var(--color-primary),
            0 1px 3px 0 #0000001a,
            0 1px 2px -1px #0000001a;
        background-color: color-mix(
            in oklab,
            var(--color-primary) 5%,
            transparent
        );
    }
    .group:hover {
        box-shadow:
            0 4px 6px -1px #0000001a,
            0 2px 4px -2px #0000001a;
    }
    .group.current:hover {
        box-shadow:
            0 0 0 2px var(--color-primary),
            0 4px 6px -1px #0000001a,
            0 2px 4px -2px #0000001a;
    }

    .group-header {
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 700;
        opacity: 0.8;
        background-color: color-mix(
            in oklab,
            var(--panel-surface) 50%,
            transparent
        );
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-block: 0.5rem;
        padding-inline: 0.75rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--panel-surface);
    }

    .excerpts {
        padding: 0.75rem;
        font-size: 0.875rem;
        line-height: 1.625;
        user-select: text;
    }
    .separator {
        color: var(--color-primary);
        margin-inline: 0.5rem;
    }
    .match {
        background-color: #fef08a;
        color: #713f12;
        font-weight: 700;
        padding-inline: 0.125rem;
        border-radius: 0.25rem;
    }
    .excerpts :global(.show-more) {
        color: var(--color-primary);
        margin-left: 0.5rem;
    }
</style>
