<script lang="ts">
    import { getContext } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import X from 'phosphor-svelte/lib/X';
    import ListBullets from 'phosphor-svelte/lib/ListBullets';
    import CaretRight from 'phosphor-svelte/lib/CaretRight';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m } from '../state/i18n.svelte';
    import type { StructureNode } from '../utils/structures';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    let structures = $derived(
        viewerState.structures.filter(
            (node: any) => !node.behaviors?.includes('sequence'),
        ),
    );
    let hasStructures = $derived(structures.length > 0);
    let panelWidth = $derived(viewerState.config.structures?.width ?? '320px');
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
                class="flex items-center gap-1 hover:bg-base-100 transition-colors {active
                    ? 'bg-primary/10 text-primary'
                    : ''}"
                style="padding-left: {node.depth * 16 + 8}px"
            >
                {#if hasChildren}
                    <button
                        class="btn btn-xs btn-ghost btn-circle shrink-0"
                        onclick={() => toggleExpanded(node.id)}
                        aria-label={expanded ? 'Collapse' : 'Expand'}
                    >
                        <span
                            class="inline-flex transition-transform duration-150"
                            style="transform: rotate({expanded
                                ? '90deg'
                                : '0deg'})"
                        >
                            <CaretRight size={14} />
                        </span>
                    </button>
                {:else}
                    <span class="w-6 shrink-0"></span>
                {/if}

                <button
                    class="flex-1 text-left text-sm py-2 pr-3 cursor-pointer truncate {active
                        ? 'font-semibold'
                        : ''}"
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
        class="h-full bg-base-200 shadow-2xl z-100 flex flex-col transition-[width] duration-200 border-l border-base-300"
        style="width: {panelWidth}"
        role="dialog"
        aria-label={m.structures_title()}
    >
        <!-- Header -->
        <div
            class="flex items-center justify-between p-4 border-b border-base-300"
        >
            <div class="flex items-center gap-2">
                <ListBullets size={20} weight="bold" />
                <h2 class="font-bold text-lg">
                    {m.structures_title()}
                </h2>
            </div>
            <button
                class="btn btn-sm btn-circle btn-ghost"
                onclick={() => viewerState.toggleStructuresPanel()}
                aria-label={m.close()}
            >
                <X size={20} />
            </button>
        </div>

        <!-- Tree Content -->
        {#if hasStructures}
            <div class="flex-1 overflow-y-auto p-0 flex flex-col">
                {@render rangeTree(structures)}
            </div>
        {:else}
            <div class="flex-1 flex items-center justify-center p-8">
                <p class="text-sm opacity-50">{m.structures_empty()}</p>
            </div>
        {/if}
    </div>
{/if}
