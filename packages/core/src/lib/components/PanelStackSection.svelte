<script lang="ts">
    import { onMount } from 'svelte';
    import X from 'phosphor-svelte/lib/X';
    import type { PanelStackItem } from './PanelStack.svelte';
    import { m } from '../state/i18n.svelte';
    import { Button } from './ui';

    interface Props {
        panel: PanelStackItem;
        scrollOnMount?: boolean;
        /** Which edge the close button sits on ('end' trailing, 'start' leading). */
        closeAlign?: 'start' | 'end';
    }

    let { panel, scrollOnMount = false, closeAlign = 'end' }: Props = $props();
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
    <div class="header" class:close-start={closeAlign === 'start'}>
        {#if panel.icon}
            <span class="icon">
                <panel.icon size={18} weight="bold" />
            </span>
        {/if}
        <span class="title">{panel.title}</span>
        {#if panel.close}
            <Button
                class="panel-close"
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
        background-color: var(--panel-surface);
        border-radius: var(--radius-panels);
        overflow: hidden;
    }

    .header {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: var(--ui-panel-header-pad, 1rem);
        /* Lighter, trimmer header label than the old 1rem/700 uppercase. */
        font-size: 0.8125rem;
        line-height: 1.25rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--panel-fg);
        background-color: var(--panel-surface);
    }

    .icon {
        display: flex;
        height: 1.125rem;
        width: 1.125rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        color: var(--color-primary-text);
    }

    .title {
        min-width: 0;
        flex: 1 1 0%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* Move the close button to the leading (image-facing) edge for a right-docked
       column that also hosts the toolbar rail, keeping it clear of the rail. */
    .header.close-start :global(.panel-close) {
        order: -1;
    }

    .content {
        min-height: 0;
        width: 100%;
    }
</style>
