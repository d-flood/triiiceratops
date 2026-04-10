<script lang="ts">
    import { getContext } from 'svelte';
    import X from 'phosphor-svelte/lib/X';
    import Folder from 'phosphor-svelte/lib/Folder';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m } from '../state/i18n.svelte';
    import { sortCollectionItems } from '../utils/collections';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    let items = $derived(sortCollectionItems(viewerState.collectionItems));
    let collectionLabel = $derived(viewerState.collectionLabel);
    let currentManifestId = $derived(viewerState.manifestId);
    let panelWidth = $derived(viewerState.config.collection?.width ?? '320px');

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
        class="h-full bg-base-200 shadow-2xl z-100 flex flex-col transition-[width] duration-200 border-l border-base-300"
        style="width: {panelWidth}"
        role="dialog"
        aria-label={m.collection_title()}
    >
        <!-- Header -->
        <div
            class="flex items-center justify-between p-4 border-b border-base-300"
        >
            <div class="flex items-center gap-2 min-w-0">
                <Folder size={20} weight="bold" class="shrink-0" />
                <h2 class="font-bold text-lg truncate">
                    {collectionLabel || m.collection_title()}
                </h2>
            </div>
            <button
                class="btn btn-sm btn-circle btn-ghost shrink-0"
                onclick={() => viewerState.toggleCollectionPanel()}
                aria-label={m.close()}
            >
                <X size={20} />
            </button>
        </div>

        <!-- Manifest Count -->
        <div
            class="p-4 border-b border-base-300 bg-base-100/50 flex items-center"
        >
            <div class="text-sm font-medium opacity-80">
                {m.collection_items_count({ count: items.length })}
            </div>
        </div>

        <!-- Items List -->
        <div
            class="flex-1 overflow-y-auto p-0 flex flex-col divide-y divide-base-300"
        >
            {#each items as item, i (item.id)}
                {@const isActive = item.id === currentManifestId}
                <button
                    class="w-full text-left p-4 hover:bg-base-100 transition-colors cursor-pointer flex gap-3 items-start {isActive
                        ? 'bg-primary/10 border-l-2 border-l-primary'
                        : ''}"
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
                            class="w-12 h-12 object-cover rounded shrink-0"
                            loading="lazy"
                        />
                    {/if}

                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-0.5">
                            {#if item.type === 'Collection'}
                                <Folder size={14} class="shrink-0 opacity-50" />
                            {/if}
                            <span
                                class="text-sm truncate {isActive
                                    ? 'font-semibold text-primary'
                                    : ''}"
                            >
                                {item.label || `Item ${i + 1}`}
                            </span>
                        </div>
                        {#if item.type === 'Collection'}
                            <span class="text-xs opacity-40"
                                >{m.collection_type_collection()}</span
                            >
                        {:else if item.navDate}
                            <span class="text-xs opacity-50"
                                >{formatNavDate(item.navDate)}</span
                            >
                        {/if}
                    </div>
                </button>
            {:else}
                <div class="p-8 text-center opacity-50 text-sm">
                    {m.collection_empty()}
                </div>
            {/each}
        </div>
    </div>
{/if}
