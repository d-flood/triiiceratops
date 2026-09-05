<script lang="ts">
    import Icon from './Icon.svelte';
    import PluginIcon from './PluginIcon.svelte';
    import { getContext, onMount } from 'svelte';
    import type { PanelStackItem } from './PanelStack.svelte';
    import { getMessages } from '../state/i18n.svelte';
    import { Button } from './ui';
    import { dismissible, panelToggleSelector } from '../utils/dismissible';
    import { FOCUS_MEMORY_KEY, type FocusMemory } from '../utils/focusMemory';

    interface Props {
        panel: PanelStackItem;
        scrollOnMount?: boolean;
        /** Which edge the close button sits on ('end' trailing, 'start' leading). */
        closeAlign?: 'start' | 'end';
    }

    let { panel, scrollOnMount = false, closeAlign = 'end' }: Props = $props();
    const m = getMessages();
    let sectionElement: HTMLElement | undefined = $state();

    // Filled by the `dismissible` action. The close button dismisses through it
    // so it returns focus by the same rule Escape does.
    const dismissal: { dismiss?: () => void } = {};

    // The toolbar toggle that opens this panel, by identity rather than by node:
    // opening a panel on the toolbar's own side docks the toolbar as a rail,
    // which destroys the toggle the reader activated and builds an identical one
    // in the rail. The panel id is the identity both sides agree on.
    const invokerSelector = $derived(panelToggleSelector(panel.id));
    const focusMemory = getContext<FocusMemory | undefined>(FOCUS_MEMORY_KEY);

    function handleClose() {
        panel.close?.();
    }

    onMount(() => {
        const el = sectionElement;

        if (scrollOnMount && el) {
            const reduce =
                typeof window !== 'undefined' &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            el.scrollIntoView({
                behavior: reduce ? 'auto' : 'smooth',
                block: 'nearest',
            });
        }
    });
</script>

<section
    bind:this={sectionElement}
    use:dismissible={{
        onDismiss: handleClose,
        controls: dismissal,
        invokerSelector,
        focusMemory,
        escape: !!panel.close,
        outsidePointer: false,
        // Only when the rail hand-off destroyed the toggle the reader was
        // standing on, and only for a panel that can actually be dismissed —
        // otherwise focus stays where it was and nothing is stolen.
        focusOnMount: panel.close ? 'orphaned' : false,
    }}
    data-panel-id={panel.id}
    class="section"
    class:fills={panel.fills}
    role={panel.dialog ? 'dialog' : undefined}
    aria-label={panel.dialog ? panel.title : undefined}
>
    <div class="header" class:close-start={closeAlign === 'start'}>
        {#if panel.iconDescriptor}
            <span class="icon">
                <PluginIcon descriptor={panel.iconDescriptor} size={18} />
            </span>
        {:else if panel.iconName}
            <span class="icon">
                <Icon name={panel.iconName} size={18} weight="bold" />
            </span>
        {/if}
        <span class="title">{panel.title}</span>
        {#if panel.close}
            <Button
                class="panel-close"
                size="xs"
                circle
                ghost
                onclick={() => dismissal.dismiss?.()}
                aria-label={m.close()}
            >
                <Icon name="X" size={16} />
            </Button>
        {/if}
    </div>
    <div class="content">
        <!--
        No core panel declares `embedded` any more — they render one way. It is
        still passed because plugin panels may declare it, and the annotation
        editor's does: this is the only signal telling a plugin panel it is
        mounted in the stack rather than standing alone.
        -->
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
        /* Rounded as a card, except on an edge the stack holds flush against the
           viewer frame — the column sets the two block-axis overrides. */
        border-start-start-radius: var(
            --panel-radius-block-start,
            var(--tri-radius-panels)
        );
        border-start-end-radius: var(
            --panel-radius-block-start,
            var(--tri-radius-panels)
        );
        border-end-end-radius: var(
            --panel-radius-block-end,
            var(--tri-radius-panels)
        );
        border-end-start-radius: var(
            --panel-radius-block-end,
            var(--tri-radius-panels)
        );
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
        color: var(--tri-color-primary-text);
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

    /* The content box is the scroller, so a filling panel's body needs no height
       cap of its own and the sticky header above it stays put. */
    .section.fills {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
    }

    .section.fills .content {
        flex: 1 1 auto;
        overflow-y: auto;
    }
</style>
