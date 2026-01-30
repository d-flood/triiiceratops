<script lang="ts">
    import { getContext } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { manifestsState } from '../state/manifests.svelte';
    import Stack from 'phosphor-svelte/lib/Stack';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    let currentCanvasId = $derived(viewerState.canvasId);
    let manifestId = $derived(viewerState.manifestId);

    // Derived: Get choices for the current canvas
    let choices = $derived.by(() => {
        if (!manifestId || !currentCanvasId) return [];
        const canvas = manifestsState
            .getCanvases(manifestId)
            .find((c: any) => (c.id || c['@id']) === currentCanvasId);
        if (!canvas) return [];

        // Logic to extract choices from canvas
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
        // Check for Choice using raw jsonld
        const isChoice =
            rawBody?.type === 'Choice' || rawBody?.type === 'oa:Choice';

        if (isChoice) {
            // Manifesto flattens items into 'body' array
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

    function select(item: any) {
        if (currentCanvasId) {
            const id = item.id || item['@id'];
            viewerState.selectChoice(currentCanvasId, id);
        }
    }

    let isVisible = $derived(choices.length > 0);

    // Helper to get label
    function getLabel(choice: any, index: number) {
        if (choice.getLabel) {
            const l = choice.getLabel();
            if (Array.isArray(l) && l.length > 0) return l[0].value;
            if (typeof l === 'string') return l;
        }
        if (choice.label) {
            // Check for lang map
            if (
                typeof choice.label === 'object' &&
                !Array.isArray(choice.label)
            ) {
                // Try 'en', or 'none', or first key
                const keys = Object.keys(choice.label);
                if (keys.includes('en')) return choice.label.en[0];
                if (keys.includes('none')) return choice.label.none[0];
                if (keys.length > 0) return choice.label[keys[0]][0];
            }
            if (typeof choice.label === 'string') return choice.label;
        }
        return `Option ${index + 1}`;
    }
</script>

{#if isVisible}
    <div
        class="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto transition-all duration-300 animate-in fade-in slide-in-from-top-2"
    >
        <div
            class="bg-base-100/90 backdrop-blur shadow-lg rounded-full p-1 border border-base-200 flex items-center gap-2"
        >
            <div
                class="px-2 text-xs font-bold opacity-50 flex items-center gap-1"
            >
                <Stack size={14} />
            </div>

            {#if choices.length <= 4}
                <!-- Radio Group for few choices -->
                <div class="join">
                    {#each choices as choice, i}
                        {@const id = choice.id || choice['@id']}
                        {@const label = getLabel(choice, i)}
                        {@const isSelected = selectedChoiceId
                            ? selectedChoiceId === id
                            : i === 0}
                        <button
                            class="join-item btn btn-xs {isSelected
                                ? 'btn-primary'
                                : 'btn-ghost'}"
                            onclick={() => select(choice)}
                            aria-pressed={isSelected}
                        >
                            {label}
                        </button>
                    {/each}
                </div>
            {:else}
                <!-- Select dropdown for many choices -->
                <select
                    class="select select-bordered select-xs rounded-full max-w-xs"
                    onchange={(e) => {
                        const idx = e.currentTarget.selectedIndex;
                        if (idx >= 0) select(choices[idx]);
                    }}
                >
                    {#each choices as choice, i}
                        {@const id = choice.id || choice['@id']}
                        {@const label = getLabel(choice, i)}
                        {@const isSelected = selectedChoiceId
                            ? selectedChoiceId === id
                            : i === 0}
                        <option value={id} selected={isSelected}>{label}</option
                        >
                    {/each}
                </select>
            {/if}
        </div>
    </div>
{/if}
