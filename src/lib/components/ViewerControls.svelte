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

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
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
</script>

{#snippet choiceControls(group: ChoiceGroup, abbreviated: boolean)}
    <div class="flex items-center gap-1">
        <div class="px-1 text-xs font-bold opacity-50 flex items-center">
            <Stack size={14} />
        </div>

        {#if group.choices.length <= 4}
            <div class="join hidden sm:flex">
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
                    <button
                        class="join-item btn btn-xs {isSelected
                            ? 'btn-primary'
                            : 'btn-ghost'}"
                        onclick={() => selectChoice(group.canvasId, choice)}
                        aria-pressed={isSelected}
                        aria-label={label}
                        title={abbreviated ? label : undefined}
                    >
                        {displayLabel}
                    </button>
                {/each}
            </div>
        {:else}
            <select
                class="select select-bordered select-xs rounded-full max-w-xs hidden sm:flex"
                onchange={(e) => {
                    const idx = e.currentTarget.selectedIndex;
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
                    {@const isSelected = group.selectedChoiceId
                        ? group.selectedChoiceId === id
                        : i === 0}
                    <option value={id} selected={isSelected}>
                        {displayLabel}
                    </option>
                {/each}
            </select>
        {/if}

        <div class="join sm:hidden">
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
                <button
                    class="join-item btn btn-xs {isSelected
                        ? 'btn-primary'
                        : 'btn-ghost'} min-w-8"
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
                </button>
            {/each}
        </div>
    </div>
{/snippet}

{#if showNav || showZoom || hasChoices}
    <div
        class="select-none absolute left-1/2 -translate-x-1/2 bg-base-200/70 backdrop-blur rounded-full shadow-lg flex items-center gap-2 z-10 border border-base-300 transition-all duration-200 bottom-4 px-2"
    >
        {#if leftChoiceGroup}
            {@render choiceControls(
                leftChoiceGroup,
                useAbbreviatedChoiceLabels,
            )}
        {/if}

        {#if leftChoiceGroup && (hasCenterControls || rightChoiceGroup)}
            <div class="h-4 w-px bg-base-content/20"></div>
        {/if}

        {#if hasCenterControls}
            <div class="flex items-center gap-2">
                {#if showZoom}
                    <div class="flex items-center gap-1">
                        <button
                            class="btn btn-circle btn-sm btn-ghost"
                            onclick={() => viewerState.zoomOut()}
                            aria-label="Zoom Out"
                        >
                            <MagnifyingGlassMinus size={18} />
                        </button>

                        <button
                            class="btn btn-circle btn-sm btn-ghost"
                            onclick={() => viewerState.zoomIn()}
                            aria-label="Zoom In"
                        >
                            <MagnifyingGlassPlus size={18} />
                        </button>
                    </div>
                {/if}

                {#if showZoom && showNav}
                    <div class="h-4 w-px bg-base-content/20"></div>
                {/if}

                {#if showNav}
                    <div class="flex items-center gap-1">
                        <button
                            class="btn btn-circle btn-sm btn-ghost"
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
                        </button>

                        <span
                            class="text-sm font-mono tabular-nums text-nowrap px-1"
                        >
                            {viewerState.currentCanvasIndex + 1} / {viewerState
                                .canvases.length}
                        </span>

                        <CanvasInfoPopover />

                        <button
                            class="btn btn-circle btn-sm btn-ghost"
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
                        </button>
                    </div>
                {/if}
            </div>
        {/if}

        {#if rightChoiceGroup && (hasCenterControls || leftChoiceGroup)}
            <div class="h-4 w-px bg-base-content/20"></div>
        {/if}

        {#if rightChoiceGroup}
            {@render choiceControls(
                rightChoiceGroup,
                useAbbreviatedChoiceLabels,
            )}
        {/if}
    </div>
{/if}
