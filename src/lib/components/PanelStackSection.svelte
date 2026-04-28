<script lang="ts">
    import { onMount } from 'svelte';
    import X from 'phosphor-svelte/lib/X';
    import type { PanelStackItem } from './PanelStack.svelte';
    import { m } from '../state/i18n.svelte';

    interface Props {
        panel: PanelStackItem;
        scrollOnMount?: boolean;
    }

    let { panel, scrollOnMount = false }: Props = $props();
    let sectionElement: HTMLElement | undefined = $state();

    onMount(() => {
        if (!scrollOnMount) return;

        sectionElement?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
        });
    });
</script>

<section
    bind:this={sectionElement}
    data-panel-id={panel.id}
    class="border-base-300 bg-base-200 rounded-box overflow-hidden"
>
    <div
        class="sticky top-0 z-10 flex items-center gap-2 px-4 py-4 text-base font-bold uppercase tracking-wide text-base-content bg-base-200"
    >
        {#if panel.icon}
            <span
                class="flex h-4 w-4 shrink-0 items-center justify-center text-primary"
            >
                <panel.icon size={22} weight="bold" />
            </span>
        {/if}
        <span class="min-w-0 flex-1 truncate">{panel.title}</span>
        {#if panel.close}
            <button
                class="btn btn-xs btn-circle btn-ghost shrink-0"
                onclick={panel.close}
                aria-label={m.close()}
            >
                <X size={16} />
            </button>
        {/if}
    </div>
    <div class="min-h-0 w-full">
        <panel.component {...panel.props ?? {}} embedded={true} />
    </div>
</section>
