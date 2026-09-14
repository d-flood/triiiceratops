<script lang="ts">
    import Icon from './Icon.svelte';
    import { getContext } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { getMessages } from '../state/i18n.svelte';
    import type { StructureNode } from '../utils/structures';
    import { formatMediaTime } from '../utils/iiifTime';
    import { findCanvasIndexById } from '../utils/iiifIds';
    import { getCanvasLabel } from '../utils/canvasLabels';
    import { Button } from './ui';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
    const m = getMessages();

    let structures = $derived(viewerState.nonSequenceStructures);
    let canvases = $derived(viewerState.canvases);
    let viewerLocale = $derived(viewerState.activeLocale);
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

    /**
     * True when ranges are chapters of a recording rather than groups of
     * canvases. Their targets all carry `#t=`, and typically all name the same
     * canvas, so canvas identity cannot tell them apart.
     */
    let isTemporal = $derived(anyTimed(structures));

    function anyTimed(nodes: StructureNode[]): boolean {
        return nodes.some(
            (node) =>
                node.canvasTimes.some((time) => time !== null) ||
                anyTimed(node.children),
        );
    }

    let selectedId = $state<string | null>(null);
    let selectedPartKey = $state<string | null>(null);

    /**
     * One row per part of a range that names a region of a canvas — the
     * columns a newspaper article occupies (Cookbook 0025), which the recipe
     * asks the reader be able to move through in the order the range lists
     * them.
     *
     * Targets naming a whole canvas get no row: they are already reachable
     * from the page controls and the gallery, and a row each would turn a
     * book's table of contents into a second copy of its page list.
     */
    interface RangePart {
        /** Identity of this target within its range, for selection. */
        key: string;
        /** Index into the range's target arrays. */
        index: number;
        label: string;
    }

    function partsOf(node: StructureNode): RangePart[] {
        const parts: RangePart[] = [];
        for (const [index, canvasId] of node.canvasIds.entries()) {
            if (!node.canvasRegions[index]) continue;
            const canvasIndex = findCanvasIndexById(canvases, canvasId);
            const canvasLabel =
                canvasIndex >= 0
                    ? getCanvasLabel(
                          canvases[canvasIndex],
                          canvasIndex,
                          viewerLocale,
                      )
                    : '';
            parts.push({
                key: `${node.id}#${index}`,
                index,
                label: `${parts.length + 1}. ${canvasLabel}`.trim(),
            });
        }
        return parts;
    }

    function navigateToTarget(node: StructureNode, index: number) {
        selectedId = node.id;
        selectedPartKey = `${node.id}#${index}`;
        viewerState.setCanvas(
            node.canvasIds[index],
            node.canvasTimes[index],
            node.canvasRegions[index],
        );
    }

    function navigateToRange(node: StructureNode) {
        selectedId = node.id;
        selectedPartKey = null;
        if (node.canvasIds.length === 0) return;
        // Choosing an article lands on its first region and opens the rest of
        // the reading sequence: the continuation is on another page, so a
        // reader given only the first column has no way to reach it.
        expandedIds.add(node.id);
        navigateToTarget(node, 0);
    }

    /**
     * The range's own `#t=` span, or null where it targets no time. The span's
     * end sets the clock shape for both bounds, so a range that ends past the
     * hour reads `0:55:05 – 1:02:10` rather than mixing widths mid-span.
     */
    function formatSpan(node: StructureNode): string | null {
        const time = node.canvasTimes.find((entry) => entry !== null);
        if (!time) return null;
        const start = formatMediaTime(time.seconds, time.endSeconds);
        return time.endSeconds === undefined || time.endSeconds <= time.seconds
            ? start
            : `${start} – ${formatMediaTime(time.endSeconds)}`;
    }

    function isActive(node: StructureNode): boolean {
        if (isTemporal) return node.id === selectedId;
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
        {@const parts = partsOf(node)}
        {@const hasChildren = node.children.length > 0 || parts.length > 0}
        {@const span = formatSpan(node)}
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
                            <Icon name="CaretRight" size={14} />
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

                {#if span}
                    <span class="span">{span}</span>
                {/if}
            </div>

            {#if hasChildren && expanded}
                {#each parts as part (part.key)}
                    <div
                        class="row part"
                        class:active={selectedPartKey === part.key}
                        style="padding-left: {(node.depth + 1) * 16 + 8}px"
                    >
                        <span class="spacer"></span>
                        <button
                            class="label-btn"
                            class:active={selectedPartKey === part.key}
                            onclick={() => navigateToTarget(node, part.index)}
                            title={part.label}
                        >
                            {part.label}
                        </button>
                    </div>
                {/each}
                {@render rangeTree(node.children)}
            {/if}
        </div>
    {/each}
{/snippet}

{#if viewerState.showStructuresPanel}
    <div
        data-panel-id="structures"
        class="tri-panel"
        role="dialog"
        aria-label={m.structures_title()}
    >
        <!-- Tree Content -->
        {#if hasStructures}
            <div class="tree">
                {@render rangeTree(structures)}
            </div>
        {:else}
            <div class="empty">
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
        transition-timing-function: var(--ui-ease);
        transition-duration: 150ms;
    }
    .row.active {
        background-color: color-mix(
            in oklab,
            var(--tri-color-primary) 10%,
            transparent
        );
        color: var(--tri-color-primary-text);
    }
    /* hover comes after .active so it wins on hover */
    .row:hover {
        background-color: var(--tri-input-bg);
    }

    .row.part .label-btn {
        font-size: 0.8125rem;
        opacity: 0.85;
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

    .span {
        flex-shrink: 0;
        padding-right: 0.75rem;
        font-size: 0.75rem;
        line-height: 1rem;
        font-variant-numeric: tabular-nums;
        opacity: 0.6;
    }

    .tree {
        display: flex;
        flex-direction: column;
    }
    .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
    }
    .empty-text {
        font-size: 0.875rem;
        line-height: 1.25rem;
        opacity: 0.5;
    }
</style>
