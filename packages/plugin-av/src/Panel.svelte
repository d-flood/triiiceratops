<!--
    The plugin's panel: a throwaway control surface, and the transcript.

    The controls above the transcript are the THROWAWAY ones. Their only job is
    to prove that playback can be commanded programmatically rather than by
    tapping the picture — the canvas-anchored transport replaces them wholesale.
    So they are deliberately unstyled and their copy is deliberately English
    literals rather than catalog keys: translating a surface that is being
    deleted costs every translator a wasted round.

    The transcript below them is not throwaway, and is localized like every
    other reader-facing string in this package.
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

    /*
        The transcript, whose lifecycle belongs to the stage manager rather than
        to this component.

        Not a `$effect`: `$effect` compiles to `user_effect`, which core's
        curated shared runtime does not publish, and `check-shared-runtime.mjs`
        fails the build on it (ticket 19's gate, working as designed). The
        manager already has an explicit "something changed" pulse in
        `publishViews`, so it mounts and releases the lazy transcript chunk off
        that; all this component owns is the node it goes in. The
        getter/setter form of `bind:this` is what hands the node over without an
        effect of any kind.
    */
    let transcriptHost: HTMLElement | null = null;
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

    <!-- The transcript's home. It stays empty — nothing is rendered into it
         and the chunk is never fetched — when the current canvas offers no
         VTT, so no control appears that could do nothing. -->
    <div
        bind:this={
            () => transcriptHost,
            (node) => {
                transcriptHost = node;
                stages.setTranscriptHost(node);
            }
        }
    ></div>
</div>
