<script lang="ts">
    import { getContext } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { manifestsState } from '../state/manifests.svelte';
    import Stack from 'phosphor-svelte/lib/Stack';
    import CaretLeft from 'phosphor-svelte/lib/CaretLeft';
    import CaretRight from 'phosphor-svelte/lib/CaretRight';
    import MagnifyingGlassPlus from 'phosphor-svelte/lib/MagnifyingGlassPlus';
    import MagnifyingGlassMinus from 'phosphor-svelte/lib/MagnifyingGlassMinus';
    import { m } from '../state/i18n.svelte';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    // Canvas navigation state
    let showNav = $derived(
        viewerState.showCanvasNav && viewerState.canvases.length > 1,
    );

    // IIIF Choice extraction logic (from ChoiceSelector)
    let currentCanvasId = $derived(viewerState.canvasId);
    let manifestId = $derived(viewerState.manifestId);

    let choices = $derived.by(() => {
        if (!manifestId || !currentCanvasId) return [];
        const canvas = manifestsState
            .getCanvases(manifestId)
            .find((c: any) => (c.id || c['@id']) === currentCanvasId);
        if (!canvas) return [];

        let images = canvas.getImages?.() || [];
        if ((!images || !images.length) && canvas.getContent) {
            images = canvas.getContent();
        }

        if (!images || !images.length) return [];

        const paintingAnno = images[0];
        if (!paintingAnno) return [];

        const body = paintingAnno.getBody
            ? paintingAnno.getBody()
            : paintingAnno.body || paintingAnno.resource;

        const rawBody = paintingAnno.__jsonld?.body || paintingAnno.body;
        const isChoice =
            rawBody?.type === 'Choice' || rawBody?.type === 'oa:Choice';

        if (isChoice) {
            let items: any[] = [];
            if (Array.isArray(body)) {
                items = body;
            } else if (body && (body.items || body.item)) {
                items = body.items || body.item;
            }
            return items;
        }

        return [];
    });

    let selectedChoiceId = $derived(
        currentCanvasId
            ? viewerState.getSelectedChoice(currentCanvasId)
            : undefined,
    );

    let hasChoices = $derived(choices.length > 0);

    function selectChoice(item: any) {
        if (currentCanvasId) {
            const id = item.id || item['@id'];
            viewerState.selectChoice(currentCanvasId, id);
        }
    }

    function getChoiceLabel(choice: any, index: number) {
        if (choice.getLabel) {
            const l = choice.getLabel();
            if (Array.isArray(l) && l.length > 0) return l[0].value;
            if (typeof l === 'string') return l;
        }
        if (choice.label) {
            if (
                typeof choice.label === 'object' &&
                !Array.isArray(choice.label)
            ) {
                const keys = Object.keys(choice.label);
                if (keys.includes('en')) return choice.label.en[0];
                if (keys.includes('none')) return choice.label.none[0];
                if (keys.length > 0) return choice.label[keys[0]][0];
            }
            if (typeof choice.label === 'string') return choice.label;
        }
        return `Option ${index + 1}`;
    }

    // Zoom controls
    let showZoom = $derived(viewerState.showZoomControls);
</script>

{#if showNav || showZoom || hasChoices}
    <div
        class="select-none absolute left-1/2 -translate-x-1/2 bg-base-200/70 backdrop-blur rounded-full shadow-lg flex items-center gap-2 z-10 border border-base-300 transition-all duration-200 bottom-4 px-2"
    >
        <!-- Choice Selector Section (first, if present) -->
        {#if hasChoices}
            <div class="flex items-center gap-1">
                <div
                    class="px-1 text-xs font-bold opacity-50 flex items-center"
                >
                    <Stack size={14} />
                </div>

                <!-- Wide Screen: Full labels -->
                {#if choices.length <= 4}
                    <div class="join hidden sm:flex">
                        {#each choices as choice, i (choice.id || choice['@id'] || i)}
                            {@const id = choice.id || choice['@id']}
                            {@const label = getChoiceLabel(choice, i)}
                            {@const isSelected = selectedChoiceId
                                ? selectedChoiceId === id
                                : i === 0}
                            <button
                                class="join-item btn btn-xs {isSelected
                                    ? 'btn-primary'
                                    : 'btn-ghost'}"
                                onclick={() => selectChoice(choice)}
                                aria-pressed={isSelected}
                            >
                                {label}
                            </button>
                        {/each}
                    </div>
                {:else}
                    <select
                        class="select select-bordered select-xs rounded-full max-w-xs hidden sm:flex"
                        onchange={(e) => {
                            const idx = e.currentTarget.selectedIndex;
                            if (idx >= 0) selectChoice(choices[idx]);
                        }}
                    >
                        {#each choices as choice, i (choice.id || choice['@id'] || i)}
                            {@const id = choice.id || choice['@id']}
                            {@const label = getChoiceLabel(choice, i)}
                            {@const isSelected = selectedChoiceId
                                ? selectedChoiceId === id
                                : i === 0}
                            <option value={id} selected={isSelected}>
                                {label}
                            </option>
                        {/each}
                    </select>
                {/if}

                <!-- Narrow Screen: Numbers for unselected, full label for selected -->
                <div class="join sm:hidden">
                    {#each choices as choice, i (choice.id || choice['@id'] || i)}
                        {@const id = choice.id || choice['@id']}
                        {@const label = getChoiceLabel(choice, i)}
                        {@const isSelected = selectedChoiceId
                            ? selectedChoiceId === id
                            : i === 0}
                        <button
                            class="join-item btn btn-xs {isSelected
                                ? 'btn-primary'
                                : 'btn-ghost'} min-w-8"
                            onclick={() => selectChoice(choice)}
                            aria-pressed={isSelected}
                            aria-label={isSelected
                                ? `Selected: ${label}`
                                : `Option ${i + 1}: ${label}`}
                        >
                            {#if isSelected}
                                {label}
                            {:else}
                                {i + 1}
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Divider between choices and zoom (if both present) -->
        {#if hasChoices && showZoom}
            <div class="h-4 w-px bg-base-content/20"></div>
        {/if}

        <!-- Zoom Controls Section -->
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

        <!-- Divider between zoom and nav (if both present) -->
        {#if showZoom && showNav}
            <div class="h-4 w-px bg-base-content/20"></div>
        {/if}
        {#if !showZoom && hasChoices && showNav}
            <div class="h-4 w-px bg-base-content/20"></div>
        {/if}

        <!-- Canvas Navigation Section -->
        {#if showNav}
            <div class="flex items-center gap-1">
                <button
                    class="btn btn-circle btn-sm btn-ghost"
                    disabled={!viewerState.hasPrevious}
                    onclick={() => viewerState.previousCanvas()}
                    aria-label={m.previous_canvas()}
                >
                    <CaretLeft size={18} />
                </button>

                <span class="text-sm font-mono tabular-nums text-nowrap px-1">
                    {viewerState.currentCanvasIndex + 1} / {viewerState.canvases
                        .length}
                </span>

                <button
                    class="btn btn-circle btn-sm btn-ghost"
                    disabled={!viewerState.hasNext}
                    onclick={() => viewerState.nextCanvas()}
                    aria-label={m.next_canvas()}
                >
                    <CaretRight size={18} />
                </button>
            </div>
        {/if}
    </div>
{/if}
