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
    import { Button, Select } from './ui';

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
                    style="border-radius:9999px;max-width:20rem"
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

{#if showNav || showZoom || hasChoices}
    <div class="control-bar" class:elevated={viewerState.showCanvasInfo}>
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
                            circle
                            size="sm"
                            ghost
                            onclick={() => viewerState.zoomOut()}
                            aria-label="Zoom Out"
                        >
                            <MagnifyingGlassMinus size={18} />
                        </Button>

                        <Button
                            circle
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
                            circle
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
                            circle
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

<style>
    .control-bar {
        user-select: none;
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        bottom: 1rem;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding-inline: 0.5rem;
        background-color: color-mix(
            in oklab,
            var(--color-base-200) 70%,
            transparent
        );
        backdrop-filter: blur(8px);
        border-radius: 9999px;
        border: 1px solid var(--color-base-300);
        box-shadow:
            0 10px 15px -3px #0000001a,
            0 4px 6px -4px #0000001a;
        transition-property: all;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.2s;
    }
    .control-bar.elevated {
        z-index: 1000;
    }

    .choice-controls {
        display: flex;
        align-items: center;
        gap: 0.25rem;
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
        gap: 0.25rem;
    }

    .divider-v {
        height: 1rem;
        width: 1px;
        background-color: color-mix(
            in oklab,
            var(--color-base-content) 20%,
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
        --join-ss: var(--radius-field);
        --join-es: var(--radius-field);
    }
    .join > :global(.join-item:last-child) {
        --join-se: var(--radius-field);
        --join-ee: var(--radius-field);
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
