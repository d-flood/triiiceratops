<script lang="ts">
    import Icon from './Icon.svelte';
    import { getContext, untrack } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { getMessages } from '../state/i18n.svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { getCanvasId } from './viewerControls';
    import { Button, TextInput, Badge, Spinner } from './ui';
    import { segmentHighlights } from '../utils/highlightSegments';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    const m = getMessages();

    let searchQuery = $state('');

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

    let totalMatches = $derived(
        viewerState.searchResults.reduce(
            (sum, group) => sum + group.hits.length,
            0,
        ),
    );

    let expandedGroups = new SvelteSet<number>();

    function toggleGroup(canvasIndex: number) {
        if (expandedGroups.has(canvasIndex)) {
            expandedGroups.delete(canvasIndex);
        } else {
            expandedGroups.add(canvasIndex);
        }
    }

    const INITIAL_EXCERPT_COUNT = 2;

    let resultsContainer = $state<HTMLElement | null>(null);

    // Also runs on init, so a canvas set via props scrolls its result into view.
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

<!--
    A search excerpt, rendered as TEXT.

    `SearchHit.before`, `match` and `after` are plain text by contract, and any
    host-supplied `SearchProvider` or remote IIIF Content Search service fills
    them. They used to reach a raw HTML sink with nothing but a `&lt;mark&gt;`
    un-escaper in the way, which let a search service execute script in the host
    page. The segmenter consumes the `<mark>` delimiters and hands back runs of
    text; everything else lands in a text node and is shown as characters.
-->
{#snippet excerpt(
    text: string,
)}{#each segmentHighlights(text) as segment, i (i)}{#if segment.highlighted}<mark
                >{segment.text}</mark
            >{:else}{segment.text}{/if}{/each}{/snippet}

<!-- Drawer / Panel -->
{#if viewerState.showSearchPanel}
    <div
        data-panel-id="search"
        class="panel"
        role="dialog"
        aria-label={m.search_panel_title()}
    >
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
                        <Icon name="MagnifyingGlass" size={20} weight="bold" />
                    {/if}
                </Button>
            </div>
        </div>

        <!-- Results -->
        <div bind:this={resultsContainer} class="results">
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
                            <Badge
                                size="sm"
                                style="--badge-color:var(--panel-surface);"
                                >{group.hits.length}
                                {group.hits.length === 1
                                    ? 'result'
                                    : 'results'}</Badge
                            >
                        </div>
                        <div class="excerpts">
                            {#each visibleHits as result, i (i)}{#if i > 0}<span
                                        class="separator">|</span
                                    >{/if}{#if result.type === 'hit'}<span
                                        >{@render excerpt(
                                            result.before ?? '',
                                        )}</span
                                    ><span class="match"
                                        >{@render excerpt(result.match)}</span
                                    ><span
                                        >{@render excerpt(
                                            result.after ?? '',
                                        )}</span
                                    >{:else}<span
                                        >{@render excerpt(result.match)}</span
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
    .search-bar {
        padding: 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--tri-surface-border);
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
    .loading-wrap {
        display: flex;
        justify-content: center;
        padding: 2rem;
    }
    .loading-wrap :global(.loading-primary) {
        color: var(--tri-color-primary-text);
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
        background-color: var(--tri-input-bg);
        box-shadow:
            0 1px 3px 0 #0000001a,
            0 1px 2px -1px #0000001a;
        border-width: 1px;
        border-style: solid;
        border-color: var(--panel-surface);
        border-radius: var(--tri-radius-panels);
        cursor: pointer;
        transition-property: all;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
        display: block;
        padding: 0;
    }
    .group.current {
        box-shadow:
            0 0 0 2px var(--tri-color-primary),
            0 1px 3px 0 #0000001a,
            0 1px 2px -1px #0000001a;
        background-color: color-mix(
            in oklab,
            var(--tri-color-primary) 5%,
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
            0 0 0 2px var(--tri-color-primary),
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
        color: var(--tri-color-primary-text);
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
        color: var(--tri-color-primary-text);
        margin-left: 0.5rem;
    }
</style>
