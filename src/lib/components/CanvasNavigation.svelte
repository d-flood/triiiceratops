<script>
    import CaretLeft from 'phosphor-svelte/lib/CaretLeft';
    import CaretRight from 'phosphor-svelte/lib/CaretRight';
    import MagnifyingGlassPlus from 'phosphor-svelte/lib/MagnifyingGlassPlus';
    import MagnifyingGlassMinus from 'phosphor-svelte/lib/MagnifyingGlassMinus';
    import { m } from '../state/i18n.svelte';
    let { viewerState } = $props();
</script>

<div
    class="select-none absolute left-1/2 -translate-x-1/2 bg-base-200/90 backdrop-blur rounded-full shadow-lg flex items-center gap-4 z-10 border border-base-300 transition-all duration-200 bottom-4"
>
    <button
        class="btn btn-circle btn-sm btn-ghost"
        disabled={!viewerState.hasPrevious}
        onclick={() => viewerState.previousCanvas()}
        aria-label={m.previous_canvas()}
    >
        <CaretLeft size={20} weight="bold" />
    </button>

    {#if viewerState.showZoomControls}
        <div class="h-4 w-px bg-base-content/20 mx-1"></div>

        <button
            class="btn btn-circle btn-sm btn-ghost"
            onclick={() => viewerState.zoomOut()}
            aria-label="Zoom Out"
        >
            <MagnifyingGlassMinus size={20} weight="bold" />
        </button>

        <button
            class="btn btn-circle btn-sm btn-ghost"
            onclick={() => viewerState.zoomIn()}
            aria-label="Zoom In"
        >
            <MagnifyingGlassPlus size={20} weight="bold" />
        </button>

        <div class="h-4 w-px bg-base-content/20 mx-1"></div>
    {/if}

    <span class="text-sm font-mono tabular-nums text-nowrap">
        {viewerState.currentCanvasIndex + 1} / {viewerState.canvases.length}
    </span>

    <button
        class="btn btn-circle btn-sm btn-ghost"
        disabled={!viewerState.hasNext}
        onclick={() => viewerState.nextCanvas()}
        aria-label={m.next_canvas()}
    >
        <CaretRight size={20} weight="bold" />
    </button>
</div>
