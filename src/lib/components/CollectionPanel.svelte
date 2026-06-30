<script lang="ts">
    import { getContext } from 'svelte';
    import Folder from 'phosphor-svelte/lib/Folder';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m } from '../state/i18n.svelte';
    import { sortCollectionItems } from '../utils/collections';

    const viewerState = getContext<
        ViewerState & { collectionThumbnail: string }
    >(VIEWER_STATE_KEY);
    let { embedded = false }: { embedded?: boolean } = $props();

    let items = $derived(sortCollectionItems(viewerState.collectionItems));
    let collectionLabel = $derived(viewerState.collectionLabel);
    let collectionThumbnail = $derived(viewerState.collectionThumbnail);
    let currentManifestId = $derived(viewerState.manifestId);

    function formatNavDate(value?: string): string {
        if (!value) return '';

        try {
            return new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
            }).format(new Date(value));
        } catch {
            return value;
        }
    }

    async function selectManifest(manifestId: string) {
        await viewerState.loadCollectionManifest(manifestId);
    }
</script>

{#if viewerState.showCollectionPanel}
    <div
        data-panel-id="collection"
        class="panel"
        class:standalone={!embedded}
        role="dialog"
        aria-label={m.collection_title()}
    >
        {#if !embedded}
            <div class="panel-header">
                <div class="panel-header-title">
                    {#if collectionThumbnail}
                        <img
                            src={collectionThumbnail}
                            alt=""
                            class="thumb"
                        />
                    {:else}
                        <Folder
                            size={20}
                            weight="bold"
                            class="icon-lead"
                        />
                    {/if}
                    <h2 class="panel-h2">
                        {collectionLabel || m.collection_title()}
                    </h2>
                </div>
            </div>
        {:else if collectionLabel || collectionThumbnail}
            <div class="panel-header-embedded">
                <div class="embedded-row">
                    {#if collectionThumbnail}
                        <img
                            src={collectionThumbnail}
                            alt=""
                            class="thumb-lg"
                        />
                    {:else}
                        <Folder
                            size={22}
                            weight="bold"
                            class="icon-lead"
                        />
                    {/if}
                    <div class="embedded-label">
                        {collectionLabel || m.collection_title()}
                    </div>
                </div>
            </div>
        {/if}

        <!-- Manifest Count -->
        <div class="count-bar">
            <div class="count-text">
                {m.collection_items_count({ count: items.length })}
            </div>
        </div>

        <!-- Items List -->
        <div class="items" class:standalone={!embedded}>
            {#each items as item, i (item.id)}
                {@const isActive = item.id === currentManifestId}
                <button
                    class="item"
                    class:active={isActive}
                    onclick={() => {
                        if (item.type === 'Manifest') {
                            selectManifest(item.id);
                        }
                    }}
                    disabled={item.type === 'Collection'}
                    title={item.type === 'Collection'
                        ? 'Nested collections not yet supported'
                        : item.label}
                >
                    {#if item.thumbnail}
                        <img
                            src={item.thumbnail}
                            alt=""
                            class="item-thumb"
                            loading="lazy"
                        />
                    {/if}

                    <div class="item-content">
                        <div class="item-title-row">
                            {#if item.type === 'Collection'}
                                <Folder
                                    size={14}
                                    class="icon-collection"
                                />
                            {/if}
                            <span
                                class="item-title"
                                class:active={isActive}
                            >
                                {item.label || `Item ${i + 1}`}
                            </span>
                        </div>
                        {#if item.type === 'Collection'}
                            <span class="item-meta-collection"
                                >{m.collection_type_collection()}</span
                            >
                        {:else if item.navDate}
                            <span class="item-meta-date"
                                >{formatNavDate(item.navDate)}</span
                            >
                        {/if}
                    </div>
                </button>
            {:else}
                <div class="empty">
                    {m.collection_empty()}
                </div>
            {/each}
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
        align-items: flex-start;
        gap: 0.5rem;
        min-width: 0;
    }
    .panel-h2 {
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.75rem;
        min-width: 0;
        overflow-wrap: break-word;
    }

    .panel-header-embedded {
        padding: 1rem;
        border-bottom: 1px solid var(--surface-border);
        background-color: color-mix(in oklab, var(--input-bg) 50%, transparent);
    }
    .embedded-row {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        min-width: 0;
    }
    .embedded-label {
        min-width: 0;
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 600;
        overflow-wrap: break-word;
    }

    .thumb {
        width: 2rem;
        height: 2rem;
        object-fit: cover;
        border-radius: 0.375rem;
        flex-shrink: 0;
        border: 1px solid var(--surface-border);
        background-color: var(--input-bg);
    }
    .thumb-lg {
        width: 2.5rem;
        height: 2.5rem;
        object-fit: cover;
        border-radius: 0.375rem;
        flex-shrink: 0;
        border: 1px solid var(--surface-border);
        background-color: var(--input-bg);
    }

    .panel-header :global(.icon-lead),
    .panel-header-embedded :global(.icon-lead) {
        flex-shrink: 0;
        margin-top: 0.25rem;
    }

    .count-bar {
        padding: 1rem;
        border-bottom: 1px solid var(--surface-border);
        background-color: color-mix(in oklab, var(--input-bg) 50%, transparent);
        display: flex;
        align-items: center;
    }
    .count-text {
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 500;
        opacity: 0.8;
    }

    .items {
        padding: 0;
        display: flex;
        flex-direction: column;
    }
    .items > * + * {
        border-top: 1px solid var(--surface-border);
    }
    .items.standalone {
        flex: 1 1 0%;
        overflow-y: auto;
    }

    .item {
        width: 100%;
        text-align: left;
        padding: 1rem;
        transition-property: color, background-color, border-color,
            text-decoration-color, fill, stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
        cursor: pointer;
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
    }
    .item.active {
        background-color: color-mix(in oklab, var(--color-primary) 10%, transparent);
        border-left: 2px solid var(--color-primary);
    }
    /* hover comes after .active so it wins on hover */
    .item:hover {
        background-color: var(--input-bg);
    }

    .item-thumb {
        width: 3rem;
        height: 3rem;
        object-fit: cover;
        border-radius: 0.25rem;
        flex-shrink: 0;
    }

    .item-content {
        flex: 1 1 0%;
        min-width: 0;
    }
    .item-title-row {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        margin-bottom: 0.125rem;
    }
    .item-title-row :global(.icon-collection) {
        flex-shrink: 0;
        opacity: 0.5;
    }
    .item-title {
        font-size: 0.875rem;
        line-height: 1.25rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .item-title.active {
        font-weight: 600;
        color: var(--color-primary);
    }

    .item-meta-collection {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.4;
    }
    .item-meta-date {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.5;
    }

    .empty {
        padding: 2rem;
        text-align: center;
        opacity: 0.5;
        font-size: 0.875rem;
        line-height: 1.25rem;
    }
</style>
