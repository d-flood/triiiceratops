<script lang="ts">
    import { getContext } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { manifestsState } from '../state/manifests.svelte';
    import Stack from 'phosphor-svelte/lib/Stack';
    import CaretLeft from 'phosphor-svelte/lib/CaretLeft';
    import CaretRight from 'phosphor-svelte/lib/CaretRight';
    import CaretUp from 'phosphor-svelte/lib/CaretUp';
    import CaretDown from 'phosphor-svelte/lib/CaretDown';
    import MagnifyingGlassPlus from 'phosphor-svelte/lib/MagnifyingGlassPlus';
    import MagnifyingGlassMinus from 'phosphor-svelte/lib/MagnifyingGlassMinus';
    import { m, language } from '../state/i18n.svelte';
    import { resolveLanguageValue } from '../utils/languageMap';
    import {
        getCanvasNavLayout,
        getVisibleChoiceGroups,
        shouldUseAbbreviatedChoiceLabels,
        type ChoiceGroup,
    } from './viewerControls';
    import CanvasInfoPopover from './CanvasInfoPopover.svelte';
    import Toolbar from './Toolbar.svelte';
    import { Button, Select } from './ui';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    // `unified` controls: the toolbar buttons are embedded at the start of this
    // control bar instead of floating separately.
    const isUnified = $derived(viewerState.config.controls === 'unified');
    let viewerLocale = $derived(
        (viewerState.config as { locale?: string }).locale || language.current,
    );

    // Canvas navigation state
    let showNav = $derived(
        viewerState.showCanvasNav && viewerState.canvases.length > 1,
    );

    let currentCanvasId = $derived(viewerState.canvasId);
    let manifestId = $derived(viewerState.manifestId);
    let visibleChoiceGroups = $derived.by(() => {
        if (!manifestId || !currentCanvasId) return [] as ChoiceGroup[];

        return getVisibleChoiceGroups({
            canvases: manifestsState.getCanvases(manifestId),
            currentCanvasId,
            currentCanvasIndex: viewerState.currentCanvasIndex,
            viewingMode: viewerState.viewingMode,
            pagedOffset: viewerState.pagedOffset,
            viewingDirection: viewerState.viewingDirection,
            getSelectedChoice: (canvasId) =>
                viewerState.getSelectedChoice(canvasId),
        });
    });

    let leftChoiceGroup = $derived(
        visibleChoiceGroups.find((group) => group.side === 'left'),
    );
    let rightChoiceGroup = $derived(
        visibleChoiceGroups.find((group) => group.side === 'right'),
    );

    // Zoom controls
    let showZoom = $derived(viewerState.showZoomControls);
    let hasChoices = $derived(visibleChoiceGroups.length > 0);
    let hasCenterControls = $derived(showZoom || showNav);
    let useAbbreviatedChoiceLabels = $derived(
        shouldUseAbbreviatedChoiceLabels(
            viewerState.viewingMode,
            visibleChoiceGroups,
        ),
    );
    let canvasNavLayout = $derived(
        getCanvasNavLayout(viewerState.viewingDirection),
    );

    function selectChoice(canvasId: string, item: any) {
        if (canvasId) {
            const id = item.id || item['@id'];
            viewerState.selectChoice(canvasId, id);
        }
    }

    function getChoiceLabel(choice: any, index: number) {
        // Try manifesto accessor
        if (choice.getLabel) {
            const l = choice.getLabel();
            const resolved = resolveLanguageValue(l, viewerLocale);
            if (resolved) return resolved;
        }
        // Try raw label property
        if (choice.label) {
            const resolved = resolveLanguageValue(choice.label, viewerLocale);
            if (resolved) return resolved;
        }
        return `Option ${index + 1}`;
    }

    function getChoiceDisplayLabel(
        choice: any,
        index: number,
        abbreviated: boolean,
    ) {
        if (abbreviated) return `${index + 1}`;
        return getChoiceLabel(choice, index);
    }

    function getNavIcon(icon: 'left' | 'right' | 'up' | 'down') {
        switch (icon) {
            case 'up':
                return CaretUp;
            case 'down':
                return CaretDown;
            case 'right':
                return CaretRight;
            default:
                return CaretLeft;
        }
    }

    let LeftNavIcon = $derived(getNavIcon(canvasNavLayout.leftIcon));
    let RightNavIcon = $derived(getNavIcon(canvasNavLayout.rightIcon));

    // Track whether the unified bar has broken into multiple rows so the
    // toolbar↔nav divider can be hidden — a vertical separator reads as noise
    // once the two groups are stacked rather than side by side. CSS can't
    // detect a flex-wrap break, so we watch the bar's size and compare the two
    // groups' offset tops: on a shared row they align to the same row box, so
    // any difference means the nav-cluster has dropped to its own row.
    let barEl: HTMLDivElement | undefined = $state();
    let toolbarEl: HTMLDivElement | undefined = $state();
    let navEl: HTMLDivElement | undefined = $state();
    let barWrapped = $state(false);

    $effect(() => {
        if (!isUnified || !barEl || !toolbarEl || !navEl) {
            barWrapped = false;
            return;
        }
        const bar = barEl;
        const toolbar = toolbarEl;
        const nav = navEl;
        const update = () => {
            barWrapped = nav.offsetTop > toolbar.offsetTop;
        };
        const ro = new ResizeObserver(update);
        ro.observe(bar);
        update();
        return () => ro.disconnect();
    });
</script>

{#snippet choiceControls(group: ChoiceGroup, abbreviated: boolean)}
    <div class="choice-controls">
        <div class="choice-stack">
            <Stack size={14} />
        </div>

        {#if group.choices.length <= 4}
            <div class="join join-desktop">
                {#each group.choices as choice, i (choice.id || choice['@id'] || i)}
                    {@const id = choice.id || choice['@id']}
                    {@const label = getChoiceLabel(choice, i)}
                    {@const displayLabel = getChoiceDisplayLabel(
                        choice,
                        i,
                        abbreviated,
                    )}
                    {@const isSelected = group.selectedChoiceId
                        ? group.selectedChoiceId === id
                        : i === 0}
                    <Button
                        class="join-item"
                        size="xs"
                        variant={isSelected ? 'primary' : 'default'}
                        ghost={!isSelected}
                        onclick={() => selectChoice(group.canvasId, choice)}
                        aria-pressed={isSelected}
                        aria-label={label}
                        title={abbreviated ? label : undefined}
                    >
                        {displayLabel}
                    </Button>
                {/each}
            </div>
        {:else}
            {@const selectedValue =
                group.selectedChoiceId ??
                group.choices[0]?.id ??
                group.choices[0]?.['@id']}
            <div class="choice-select-wrap">
                <Select
                    size="xs"
                    value={selectedValue}
                    style="border-radius:var(--radius-controls-buttons);max-width:20rem"
                    onchange={(e: Event) => {
                        const idx = (e.currentTarget as HTMLSelectElement)
                            .selectedIndex;
                        if (idx >= 0)
                            selectChoice(group.canvasId, group.choices[idx]);
                    }}
                >
                    {#each group.choices as choice, i (choice.id || choice['@id'] || i)}
                        {@const id = choice.id || choice['@id']}
                        {@const displayLabel = getChoiceDisplayLabel(
                            choice,
                            i,
                            abbreviated,
                        )}
                        <option value={id}>
                            {displayLabel}
                        </option>
                    {/each}
                </Select>
            </div>
        {/if}

        <div class="join join-mobile">
            {#each group.choices as choice, i (choice.id || choice['@id'] || i)}
                {@const id = choice.id || choice['@id']}
                {@const label = getChoiceLabel(choice, i)}
                {@const displayLabel = getChoiceDisplayLabel(
                    choice,
                    i,
                    abbreviated,
                )}
                {@const isSelected = group.selectedChoiceId
                    ? group.selectedChoiceId === id
                    : i === 0}
                <Button
                    class="join-item"
                    size="xs"
                    variant={isSelected ? 'primary' : 'default'}
                    ghost={!isSelected}
                    style="min-width:2rem"
                    onclick={() => selectChoice(group.canvasId, choice)}
                    aria-pressed={isSelected}
                    aria-label={isSelected
                        ? `Selected: ${label}`
                        : `Option ${i + 1}: ${label}`}
                    title={abbreviated ? label : undefined}
                >
                    {#if abbreviated}
                        {displayLabel}
                    {:else if isSelected}
                        {label}
                    {:else}
                        {i + 1}
                    {/if}
                </Button>
            {/each}
        </div>
    </div>
{/snippet}

{#if showNav || showZoom || hasChoices || isUnified}
    <div
        class="control-bar"
        class:elevated={viewerState.showCanvasInfo}
        class:wrapped={barWrapped}
        bind:this={barEl}
    >
        {#if isUnified}
            <div class="toolbar-in-bar" bind:this={toolbarEl}>
                <Toolbar inline />
            </div>
            {#if (hasChoices || hasCenterControls) && !barWrapped}
                <div class="divider-v group-divider"></div>
            {/if}
        {/if}

        {#if hasChoices || hasCenterControls}
        <!-- The canvas nav/zoom/choices are kept together as one no-wrap group:
             the bar's first break separates this cluster from the toolbar
             buttons (see .control-bar / .nav-cluster), and this cluster itself
             never breaks internally. -->
        <div class="nav-cluster" bind:this={navEl}>
        {#if leftChoiceGroup}
            {@render choiceControls(
                leftChoiceGroup,
                useAbbreviatedChoiceLabels,
            )}
        {/if}

        {#if leftChoiceGroup && (hasCenterControls || rightChoiceGroup)}
            <div class="divider-v"></div>
        {/if}

        {#if hasCenterControls}
            <div class="center-controls">
                {#if showZoom}
                    <div class="btn-row">
                        <Button
                            square
                            size="sm"
                            ghost
                            onclick={() => viewerState.zoomOut()}
                            aria-label="Zoom Out"
                        >
                            <MagnifyingGlassMinus size={18} />
                        </Button>

                        <Button
                            square
                            size="sm"
                            ghost
                            onclick={() => viewerState.zoomIn()}
                            aria-label="Zoom In"
                        >
                            <MagnifyingGlassPlus size={18} />
                        </Button>
                    </div>
                {/if}

                {#if showZoom && showNav}
                    <div class="divider-v"></div>
                {/if}

                {#if showNav}
                    <div class="btn-row">
                        <Button
                            square
                            size="sm"
                            ghost
                            disabled={canvasNavLayout.leftButton === 'previous'
                                ? !viewerState.hasPrevious
                                : !viewerState.hasNext}
                            onclick={() =>
                                canvasNavLayout.leftButton === 'previous'
                                    ? viewerState.previousCanvas()
                                    : viewerState.nextCanvas()}
                            aria-label={canvasNavLayout.leftButton ===
                            'previous'
                                ? m.previous_canvas()
                                : m.next_canvas()}
                        >
                            <LeftNavIcon size={18} />
                        </Button>

                        <span class="nav-index">
                            {viewerState.currentCanvasIndex + 1} / {viewerState
                                .canvases.length}
                        </span>

                        <CanvasInfoPopover />

                        <Button
                            square
                            size="sm"
                            ghost
                            disabled={canvasNavLayout.rightButton === 'next'
                                ? !viewerState.hasNext
                                : !viewerState.hasPrevious}
                            onclick={() =>
                                canvasNavLayout.rightButton === 'next'
                                    ? viewerState.nextCanvas()
                                    : viewerState.previousCanvas()}
                            aria-label={canvasNavLayout.rightButton === 'next'
                                ? m.next_canvas()
                                : m.previous_canvas()}
                        >
                            <RightNavIcon size={18} />
                        </Button>
                    </div>
                {/if}
            </div>
        {/if}

        {#if rightChoiceGroup && (hasCenterControls || leftChoiceGroup)}
            <div class="divider-v"></div>
        {/if}

        {#if rightChoiceGroup}
            {@render choiceControls(
                rightChoiceGroup,
                useAbbreviatedChoiceLabels,
            )}
        {/if}
        </div>
        {/if}
    </div>
{/if}

<style>
    .control-bar {
        user-select: none;
        position: absolute;
        /* Horizontal alignment is set per data-nav-pos below; center is default.
           Center via auto margins with left/right anchored to both edges rather
           than the `left:50% + translateX(-50%)` trick — the latter caps the
           box's available width at 50% of the container (the distance from the
           50% mark to the right edge), which forces the unified bar to
           wrap/shrink once its content exceeds half the viewport. Spanning both
           edges lets it grow to nearly the full width (minus the chrome inset on
           each side) before it's constrained. */
        left: var(--ui-nav-inset, 0);
        right: var(--ui-nav-inset, 0);
        width: fit-content;
        max-width: calc(100% - 2 * var(--ui-nav-inset, 0));
        margin-inline: auto;
        bottom: var(--ui-nav-inset, 0);
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        /* Allow the bar to break: the toolbar-button group and the nav-cluster
           are the two flex items, so when combined they exceed the available
           width the (later) nav-cluster drops to its own row first. Row-gap
           matches the inline gap so stacked rows sit evenly. */
        flex-wrap: wrap;
        gap: var(--ui-gap, 0.5rem);
        padding-inline: var(--ui-chrome-pad, 0.5rem);
        /* Vertically centre the stacked rows (a no-op on a single row). */
        align-content: center;
        color: var(--toolbar-content);
        border-radius: var(--radius-controls);
        border: 1px solid var(--surface-border);
        box-shadow: var(--ui-nav-shadow, none);
        transition-property: all;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.2s;
    }
    /* Glass on a ::before layer so `.control-bar` doesn't establish a
       backdrop-filter isolation root — this lets popovers anchored to the
       unified-bar buttons run their own backdrop-filter against the image.
       `.control-bar` has z-index/position (a stacking context), so the pseudo
       sits behind the bar's content but above the canvas. */
    .control-bar::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        /* Inset by the 1px border (inset:0 resolves to the padding box), so the
           radius must shrink by that same amount to stay concentric with the
           outer border — using the parent's radius as-is leaves a gap at the
           corners where the border's background peeks through. */
        border-radius: calc(var(--radius-controls) - var(--border, 1px));
        background-color: color-mix(
            in oklab,
            var(--toolbar-bg) 70%,
            transparent
        );
        backdrop-filter: blur(8px);
    }
    .control-bar.elevated {
        z-index: 1000;
    }
    /* Once broken into rows, give the stacked content equal breathing room top
       and bottom — on a single row the pill hugs the controls (no block
       padding), which reads as uneven spacing once a second row appears. */
    .control-bar.wrapped {
        padding-block: var(--ui-chrome-pad, 0.5rem);
    }

    /* nav=docked — the control bar sits flush to the bottom edge: only the top
       corners rounded, no bottom border. */
    :global([data-nav='docked']) .control-bar {
        border-bottom: 0;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
    }
    /* ::before no longer uses border-radius: inherit (see above), so the
       squared corners must be mirrored onto it explicitly. */
    :global([data-nav='docked']) .control-bar::before {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
    }

    /* nav-pos — horizontal alignment of the control bar (offset honours the
       floating inset; 0 when docked). */
    :global([data-nav-pos='left']) .control-bar {
        left: var(--ui-nav-inset, 0);
        right: auto;
        transform: none;
        margin-inline: 0;
    }
    :global([data-nav-pos='right']) .control-bar {
        left: auto;
        right: var(--ui-nav-inset, 0);
        transform: none;
        margin-inline: 0;
    }
    /* Square the edge-touching corner when docked into a bottom corner. */
    :global([data-nav='docked'][data-nav-pos='left']) .control-bar {
        border-top-left-radius: 0;
        border-left: 0;
    }
    :global([data-nav='docked'][data-nav-pos='right']) .control-bar {
        border-top-right-radius: 0;
        border-right: 0;
    }
    :global([data-nav='docked'][data-nav-pos='left']) .control-bar::before {
        border-top-left-radius: 0;
    }
    :global([data-nav='docked'][data-nav-pos='right']) .control-bar::before {
        border-top-right-radius: 0;
    }

    /* Unified — the toolbar buttons sit at the start of the control bar,
       separated from the canvas nav/zoom by a divider. */
    .toolbar-in-bar {
        display: inline-flex;
        align-items: center;
    }
    /* The nav/zoom/choices group: stays on a single line (never breaks
       internally) so the only break here is between it and the toolbar
       buttons. */
    .nav-cluster {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        gap: var(--ui-gap, 0.5rem);
    }

    .choice-controls {
        display: flex;
        align-items: center;
        gap: var(--ui-gap, 0.25rem);
    }
    .choice-stack {
        display: flex;
        align-items: center;
        padding-inline: 0.25rem;
        font-size: 0.75rem;
        line-height: 1rem;
        font-weight: 700;
        opacity: 0.5;
    }

    .center-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .btn-row {
        display: flex;
        align-items: center;
        gap: var(--ui-gap, 0.25rem);
    }
    /* The pill's zoom/nav buttons inherit the controls-button radius (defaults to the
       field radius) rather than being forced circles. Scoped to .btn-row so the choice
       .join-item buttons keep their own join radii. */
    .control-bar .btn-row :global(.btn) {
        border-start-start-radius: var(--radius-controls-buttons);
        border-start-end-radius: var(--radius-controls-buttons);
        border-end-end-radius: var(--radius-controls-buttons);
        border-end-start-radius: var(--radius-controls-buttons);
    }

    .divider-v {
        height: 1rem;
        width: 1px;
        background-color: color-mix(
            in oklab,
            var(--toolbar-content) 20%,
            transparent
        );
    }

    .nav-index {
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            'Liberation Mono', 'Courier New', monospace;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        padding-inline: 0.25rem;
    }

    /* join group (radii handled by the join-aware primitives) */
    .join {
        display: inline-flex;
        align-items: stretch;
        --join-ss: 0;
        --join-se: 0;
        --join-es: 0;
        --join-ee: 0;
    }
    .join > :global(.join-item:first-child) {
        --join-ss: var(--radius-buttons);
        --join-es: var(--radius-buttons);
    }
    .join > :global(.join-item:last-child) {
        --join-se: var(--radius-buttons);
        --join-ee: var(--radius-buttons);
    }
    .join > :global(.join-item:not(:first-child)) {
        margin-inline-start: calc(var(--border, 1px) * -1);
    }

    .join-desktop {
        display: none;
    }
    .choice-select-wrap {
        display: none;
    }
    @media (width >= 640px) {
        .join-desktop {
            display: inline-flex;
        }
        .choice-select-wrap {
            display: flex;
        }
        .join-mobile {
            display: none;
        }
    }
</style>
