<script lang="ts">
    import { getContext } from 'svelte';
    import PuzzlePiece from 'phosphor-svelte/lib/PuzzlePiece';
    import X from 'phosphor-svelte/lib/X';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m } from '../state/i18n.svelte';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    let sortedPluginButtons = $derived(
        [...viewerState.pluginMenuButtons].sort(
            (a, b) => (a.order ?? 100) - (b.order ?? 100),
        ),
    );

    let isOpen = $state(false);

    function toggleOpen() {
        isOpen = !isOpen;
    }
</script>

{#if sortedPluginButtons.length > 0}
    <div
        class="absolute left-6 bottom-6 z-50 pointer-events-auto flex flex-col items-start transition-all duration-300"
    >
        <!-- Plugin Buttons Stack -->
        <div
            class="flex flex-col-reverse gap-3 mb-3 transition-all duration-300 origin-bottom {isOpen
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 translate-y-4 scale-90 pointer-events-none'}"
        >
            {#each sortedPluginButtons as button (button.id)}
                {@const Icon = button.icon}
                <div class="tooltip tooltip-right" data-tip={button.tooltip}>
                    <button
                        aria-label={button.tooltip}
                        class="btn btn-lg btn-circle shadow-lg {button.isActive?.()
                            ? (button.activeClass ?? 'btn-primary')
                            : 'btn-neutral'}"
                        onclick={() => {
                            button.onClick();
                            isOpen = false;
                        }}
                    >
                        <Icon size={28} weight="bold" />
                    </button>
                </div>
            {/each}
        </div>

        <!-- Main Toggle Button -->
        <div class="tooltip tooltip-right" data-tip="Plugins">
            <button
                class="btn btn-lg btn-secondary btn-circle shadow-xl transition-transform duration-300 {isOpen
                    ? 'rotate-90'
                    : ''}"
                aria-label="Plugins"
                onclick={toggleOpen}
            >
                {#if isOpen}
                    <X size={28} weight="bold" />
                {:else}
                    <PuzzlePiece size={28} weight="bold" />
                {/if}
            </button>
        </div>
    </div>
{/if}
