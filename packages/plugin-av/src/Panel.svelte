<!--
    THROWAWAY control surface.

    Its only job is to prove that playback can be commanded programmatically, not
    by tapping the picture — the canvas-anchored transport replaces it wholesale.
    So it is deliberately unstyled and its copy is deliberately English literals
    rather than catalog keys: translating a surface that is being deleted costs
    every translator a wasted round.
-->
<script lang="ts">
    import { getContext } from 'svelte';

    import { PLUGIN_CONTEXT_KEY, type PanelContext } from './contextKey';

    const { context, stages } = getContext<PanelContext>(PLUGIN_CONTEXT_KEY);

    /**
     * Command the chosen canvas the way a HOST would: make it current, then
     * command AVState — which addresses the current canvas's media. Reads of
     * viewer state are synchronous, so the command lands on the canvas this
     * click just navigated to.
     */
    function toggle(canvasId: string, paused: boolean): void {
        context.viewerState.setCanvas(canvasId);
        if (paused) stages.avState.play();
        else stages.avState.pause();
    }

    /** `''` means "whichever stage is first" — see the leading option below. */
    let focusedCanvasId = $state('');

    const views = $derived(stages.views);
    const focused = $derived(
        views.find((view) => view.canvasId === focusedCanvasId) ??
            views[0] ??
            null,
    );
</script>

<div class="tri-av-panel" data-testid="av-panel">
    {#if focused === null}
        <p>This manifest paints no time-based media.</p>
    {:else}
        <label>
            Canvas
            <select bind:value={focusedCanvasId} data-testid="av-canvas-select">
                <option value="">First AV canvas</option>
                {#each views as view (view.canvasId)}
                    <option value={view.canvasId}>{view.label}</option>
                {/each}
            </select>
        </label>

        <button
            type="button"
            data-testid="av-toggle"
            disabled={focused.unplayable}
            onclick={() => toggle(focused.canvasId, focused.paused)}
        >
            {#if focused.paused}Play{:else}Pause{/if}
        </button>

        <p data-testid="av-stage-count">
            {views.length} media canvas(es) claimed
        </p>
    {/if}
</div>
