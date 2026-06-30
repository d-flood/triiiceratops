<script lang="ts">
    import { onMount } from 'svelte';
    import X from 'phosphor-svelte/lib/X';
    import type { PanelStackItem } from './PanelStack.svelte';
    import { m } from '../state/i18n.svelte';
    import { Button } from './ui';

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

<section bind:this={sectionElement} data-panel-id={panel.id} class="section">
    <div class="header">
        {#if panel.icon}
            <span class="icon">
                <panel.icon size={22} weight="bold" />
            </span>
        {/if}
        <span class="title">{panel.title}</span>
        {#if panel.close}
            <Button
                size="xs"
                circle
                ghost
                onclick={panel.close}
                aria-label={m.close()}
            >
                <X size={16} />
            </Button>
        {/if}
    </div>
    <div class="content">
        <panel.component {...panel.props ?? {}} embedded={true} />
    </div>
</section>

<style>
    .section {
        /* Don't let the flex column (.panel-stack) shrink sections to fit.
           Because .section has overflow:hidden, its flex auto-min-height would
           otherwise resolve to 0 and the column would compress + clip panels
           instead of overflowing, so the stack's overflow-y:auto never scrolls. */
        flex-shrink: 0;
        background-color: var(--color-base-200);
        border-radius: var(--radius-box);
        overflow: hidden;
    }

    .header {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem;
        font-size: 1rem;
        line-height: 1.5rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.025em;
        color: var(--color-base-content);
        background-color: var(--color-base-200);
    }

    .icon {
        display: flex;
        height: 1rem;
        width: 1rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        color: var(--color-primary);
    }

    .title {
        min-width: 0;
        flex: 1 1 0%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .content {
        min-height: 0;
        width: 100%;
    }
</style>
