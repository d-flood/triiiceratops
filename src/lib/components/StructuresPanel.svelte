<script lang="ts">
    import { getContext } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import ListBullets from 'phosphor-svelte/lib/ListBullets';
    import CaretRight from 'phosphor-svelte/lib/CaretRight';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m } from '../state/i18n.svelte';
    import type { StructureNode } from '../utils/structures';
    import { Button } from './ui';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
    let { embedded = false }: { embedded?: boolean } = $props();

    let structures = $derived(
        viewerState.structures.filter(
            (node: any) => !node.behaviors?.includes('sequence'),
        ),
    );
    let hasStructures = $derived(structures.length > 0);
    let autoExpandedId = $derived(
        structures.length === 1 && structures[0].children.length > 0
            ? structures[0].id
            : null,
    );

    const expandedIds = new SvelteSet<string>();

    function toggleExpanded(id: string) {
        if (expandedIds.has(id)) {
            expandedIds.delete(id);
        } else {
            expandedIds.add(id);
        }
    }

    function navigateToRange(node: StructureNode) {
        if (node.canvasIds.length > 0) {
            viewerState.setCanvas(node.canvasIds[0]);
        }
    }

    function isActive(node: StructureNode): boolean {
        return viewerState.canvasId
            ? node.canvasIds.includes(viewerState.canvasId)
            : false;
    }
</script>

{#snippet rangeTree(nodes: StructureNode[])}
    {#each nodes as node (node.id)}
        {@const expanded =
            autoExpandedId === node.id || expandedIds.has(node.id)}
        {@const active = isActive(node)}
        {@const hasChildren = node.children.length > 0}
        <div>
            <div
                class="row"
                class:active
                style="padding-left: {node.depth * 16 + 8}px"
            >
                {#if hasChildren}
                    <Button
                        size="xs"
                        ghost
                        circle
                        onclick={() => toggleExpanded(node.id)}
                        aria-label={expanded ? 'Collapse' : 'Expand'}
                    >
                        <span
                            class="caret"
                            style="transform: rotate({expanded
                                ? '90deg'
                                : '0deg'})"
                        >
                            <CaretRight size={14} />
                        </span>
                    </Button>
                {:else}
                    <span class="spacer"></span>
                {/if}

                <button
                    class="label-btn"
                    class:active
                    onclick={() => navigateToRange(node)}
                    title={node.label}
                >
                    {node.label || node.id}
                </button>
            </div>

            {#if hasChildren && expanded}
                {@render rangeTree(node.children)}
            {/if}
        </div>
    {/each}
{/snippet}

{#if viewerState.showStructuresPanel}
    <div
        data-panel-id="structures"
        class="panel"
        class:standalone={!embedded}
        role="dialog"
        aria-label={m.structures_title()}
    >
        {#if !embedded}
            <div class="panel-header">
                <div class="panel-header-title">
                    <ListBullets size={20} weight="bold" />
                    <h2 class="panel-h2">
                        {m.structures_title()}
                    </h2>
                </div>
            </div>
        {/if}

        <!-- Tree Content -->
        {#if hasStructures}
            <div class="tree" class:standalone={!embedded}>
                {@render rangeTree(structures)}
            </div>
        {:else}
            <div class="empty" class:standalone={!embedded}>
                <p class="empty-text">{m.structures_empty()}</p>
            </div>
        {/if}
    </div>
{/if}

<style>
    .row {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        transition-property: color, background-color, border-color;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
    }
    .row.active {
        background-color: color-mix(in oklab, var(--color-primary) 10%, transparent);
        color: var(--color-primary);
    }
    /* hover comes after .active so it wins on hover */
    .row:hover {
        background-color: var(--input-bg);
    }

    .caret {
        display: inline-flex;
        transition: transform 150ms;
    }

    .spacer {
        width: 1.5rem;
        flex-shrink: 0;
    }

    .label-btn {
        flex: 1 1 0%;
        text-align: left;
        font-size: 0.875rem;
        line-height: 1.25rem;
        padding-block: 0.5rem;
        padding-right: 0.75rem;
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        background: transparent;
        border: 0;
        color: inherit;
    }
    .label-btn.active {
        font-weight: 600;
    }

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
        transition: width 200ms;
        border-left: 1px solid var(--surface-border);
    }

    .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem;
        border-bottom: 1px solid var(--surface-border);
    }
    .panel-header-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .panel-h2 {
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.75rem;
    }

    .tree {
        display: flex;
        flex-direction: column;
    }
    .tree.standalone {
        flex: 1 1 0%;
        overflow-y: auto;
    }

    .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
    }
    .empty.standalone {
        flex: 1 1 0%;
    }
    .empty-text {
        font-size: 0.875rem;
        line-height: 1.25rem;
        opacity: 0.5;
    }
</style>
