<script lang="ts">
    import { getContext } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { getMessages } from '../state/i18n.svelte';
    import { getCanvasLabel } from '../utils/canvasLabels';
    import { dismissible } from '../utils/dismissible';
    import { getCanvasId } from '../utils/iiifIds';
    import { nextRovingIndex } from '../utils/roving';
    import { scrollWithin } from '../utils/scrollWithin';
    import Icon from './Icon.svelte';
    import { getCanvasNavLayout, getPagedCanvasGroups } from './viewerControls';
    import { Button } from './ui';

    let {
        openDown = false,
        tooltipPlacement,
    }: {
        /** The bar is docked to the top edge, so the list hangs below it. */
        openDown?: boolean;
        tooltipPlacement: string;
    } = $props();

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
    const m = getMessages();

    let trigger = $state<HTMLButtonElement | null>(null);
    let list = $state<HTMLDivElement | null>(null);

    const open = $derived(viewerState.openMenu === 'canvases');
    const canvases = $derived(viewerState.canvases);
    const position = $derived(
        `${viewerState.currentCanvasIndex + 1} / ${canvases.length}`,
    );
    const pagedGroups = $derived(
        viewerState.viewingMode === 'paged'
            ? getPagedCanvasGroups(canvases, viewerState.pagedOffset)
            : null,
    );
    const groupOf = (index: number) =>
        pagedGroups?.find(
            (group) => index >= group.startIndex && index <= group.endIndex,
        );
    const current = $derived.by(() => {
        const index = viewerState.currentCanvasIndex;
        const group = groupOf(index);
        return group
            ? { start: group.startIndex, end: group.endIndex }
            : { start: index, end: index };
    });
    // Ordered as the nav arrows read, so First sits under ‹ in a left-to-right
    // book and under › in a right-to-left one.
    const ends = $derived.by(() => {
        const last = canvases.length - 1;
        const both = [
            {
                index: 0,
                label: m.first_canvas(),
                disabled: current.start === 0,
            },
            {
                index: last,
                label: m.last_canvas(),
                disabled: current.end === last,
            },
        ];
        return getCanvasNavLayout(viewerState.viewingDirection).leftButton ===
            'previous'
            ? both
            : both.reverse();
    });

    function goTo(index: number) {
        const canvasId = pagedGroups
            ? groupOf(index)?.entries[0]?.canvasId
            : getCanvasId(canvases[index]);
        if (canvasId && canvasId !== viewerState.canvasId) {
            viewerState.setCanvas(canvasId);
        }
        viewerState.setOpenMenu(null);
        trigger?.focus();
    }

    function onTriggerClick() {
        viewerState.toggleMenu('canvases');
        // The list is not in the DOM until the reactive flush.
        requestAnimationFrame(() =>
            list
                ?.querySelector<HTMLElement>('[aria-current="true"]')
                ?.focus({ preventScroll: true }),
        );
    }

    function onMenuKeydown(
        event: KeyboardEvent & { currentTarget: HTMLElement },
    ) {
        const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
                '[role="menuitem"]:not(:disabled)',
            ),
        );
        const root = event.currentTarget.getRootNode() as Document | ShadowRoot;
        const next =
            items[
                nextRovingIndex(
                    event.key,
                    items.indexOf(root.activeElement as HTMLElement),
                    items.length,
                )
            ];
        if (!next) return;
        event.preventDefault();
        next.focus({ preventScroll: true });
        if (list?.contains(next)) scrollWithin(list, next, 'nearest');
    }

    /** Fits the list to the room between the bar and the far viewer edge. */
    function place(menu: HTMLElement) {
        const area = menu.closest('.viewer-area')?.getBoundingClientRect();
        const bar = menu.parentElement!.getBoundingClientRect();
        if (area) {
            menu.style.setProperty(
                '--room',
                `${openDown ? area.bottom - bar.bottom : bar.top - area.top}px`,
            );
        }
        const rows = menu.querySelector<HTMLElement>('.rows')!;
        const row = rows.querySelector('[aria-current="true"]');
        if (row) scrollWithin(rows, row, 'center');
    }
</script>

{#snippet endsRow()}
    <div class="ends" role="group">
        <button
            type="button"
            role="menuitem"
            class="tri-menu-item"
            disabled={ends[0].disabled}
            onclick={() => goTo(ends[0].index)}
        >
            <Icon name="CaretLineLeft" size={16} />
            <span>{ends[0].label}</span>
        </button>
        <button
            type="button"
            role="menuitem"
            class="tri-menu-item trailing"
            disabled={ends[1].disabled}
            onclick={() => goTo(ends[1].index)}
        >
            <span>{ends[1].label}</span>
            <Icon name="CaretLineRight" size={16} />
        </button>
    </div>
{/snippet}

<div class="canvas-menu">
    <Button
        bind:element={trigger}
        size="sm"
        ghost
        type="button"
        class="nav-index {open ? '' : `tooltip ${tooltipPlacement}`}"
        data-tip={m.go_to_canvas()}
        aria-label="{m.go_to_canvas()} ({position})"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="tri-flyout-canvases"
        onclick={onTriggerClick}
    >
        {position}
    </Button>

    {#if open}
        <div
            use:dismissible={{
                onDismiss: () => viewerState.setOpenMenu(null),
                invoker: trigger,
                within: [trigger],
                focusOnMount: false,
            }}
            use:place
            id="tri-flyout-canvases"
            class="tri-menu tri-menu-surface wide canvas-list"
            class:down={openDown}
            style:--digits={String(canvases.length).length}
            role="menu"
            tabindex="-1"
            aria-label={m.go_to_canvas()}
            onkeydown={onMenuKeydown}
        >
            {#if openDown}
                {@render endsRow()}
            {/if}
            <div class="rows" bind:this={list}>
                {#each canvases as canvas, index (index)}
                    {@const isCurrent =
                        index >= current.start && index <= current.end}
                    <button
                        type="button"
                        role="menuitem"
                        class="tri-menu-item row"
                        class:is-active={isCurrent}
                        aria-current={isCurrent ? 'true' : undefined}
                        tabindex="-1"
                        onclick={() => goTo(index)}
                    >
                        <span class="ordinal">{index + 1}.</span>
                        <span class="label"
                            >{getCanvasLabel(
                                canvas,
                                index,
                                viewerState.activeLocale,
                            )}</span
                        >
                        {#if isCurrent}
                            <Icon name="Check" size={16} />
                        {/if}
                    </button>
                {/each}
            </div>
            {#if !openDown}
                {@render endsRow()}
            {/if}
        </div>
    {/if}
</div>

<style>
    .canvas-menu {
        position: relative;
        display: flex;
    }

    .canvas-menu :global(.nav-index) {
        font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            'Liberation Mono', 'Courier New', monospace;
        font-size: 0.875rem;
        font-weight: 400;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        padding-inline: 0.375rem;
    }

    /* The look is the shared menu surface (src/styles/menu.css); what is local
       is where it hangs and that its rows scroll. */
    .canvas-list {
        position: absolute;
        bottom: 100%;
        left: 50%;
        translate: -50% 0;
        margin-bottom: 1.5rem;
        z-index: 1001;
        flex-wrap: nowrap;
        max-width: 20rem;
    }
    .canvas-list.down {
        bottom: auto;
        top: 100%;
        margin: 1.5rem 0 0;
    }
    @media (prefers-reduced-motion: no-preference) {
        .canvas-list {
            transition-property: opacity, scale;
            transition-duration: 0.2s;
            transition-timing-function: var(--ui-ease);
        }
        @starting-style {
            .canvas-list {
                opacity: 0;
                scale: 95%;
            }
        }
    }

    .rows {
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        overscroll-behavior: contain;
        max-height: min(20rem, calc(var(--room, 24rem) - 7rem));
    }
    .rows + .ends,
    .ends + .rows {
        border-top: 1px solid
            color-mix(in oklab, var(--tri-toolbar-content) 20%, transparent);
        margin-top: 0.25rem;
        padding-top: 0.25rem;
    }

    .row {
        grid-template-columns: auto minmax(0, 1fr) auto;
    }
    .ordinal {
        min-width: calc(var(--digits) * 1ch + 0.5ch);
        text-align: end;
        font-variant-numeric: tabular-nums;
        opacity: 0.7;
    }
    .label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .ends {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.25rem;
    }
    .trailing {
        justify-content: end;
    }
    .ends :disabled {
        opacity: 0.4;
        pointer-events: none;
    }
</style>
