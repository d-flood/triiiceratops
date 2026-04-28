<script lang="ts">
    import { onMount } from 'svelte';
    import type { PanelStackItem } from './PanelStack.svelte';

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
    class="border-base-300 border bg-base-200 rounded-box overflow-hidden"
>
    <div
        class="sticky top-0 z-10 flex items-center gap-2 px-4 py-4 text-base font-bold uppercase tracking-wide text-base-content border-b-4 border-base-300 bg-base-200"
    >
        {#if panel.icon}
            <span
                class="flex h-4 w-4 shrink-0 items-center justify-center text-primary"
            >
                <panel.icon size={22} weight="bold" />
            </span>
        {/if}
        <span class="truncate">{panel.title}</span>
    </div>
    <div class="min-h-0 w-full">
        <panel.component {...panel.props ?? {}} embedded={true} />
    </div>
</section>
