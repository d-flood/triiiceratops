<script>
    import CaretLeft from 'phosphor-svelte/lib/CaretLeft';
    import CaretRight from 'phosphor-svelte/lib/CaretRight';
    import { m } from '../state/i18n.svelte';
    let { viewerState } = $props();
</script>

<div
    class="select-none absolute left-1/2 -translate-x-1/2 bg-base-200/90 backdrop-blur rounded-full shadow-lg px-4 py-2 flex items-center gap-4 z-10 border border-base-300 transition-all duration-200 bottom-4"
>
    <button
        class="btn btn-circle btn-sm btn-ghost"
        disabled={!viewerState.hasPrevious}
        onclick={() => viewerState.previousCanvas()}
        aria-label={m.previous_canvas()}
    >
        <CaretLeft size={20} weight="bold" />
    </button>

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
