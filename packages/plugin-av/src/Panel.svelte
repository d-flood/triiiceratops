<!--
    Runes mode, declared rather than inferred: with no rune left in the
    component the compiler would fall back to legacy mode and make
    `transcriptHost` a reactive `mutable_source`, which core's curated shared
    runtime does not publish.
-->
<svelte:options runes />

<script lang="ts">
    import { getContext } from 'svelte';

    import { PLUGIN_CONTEXT_KEY, type PanelContext } from './contextKey';

    const { stages } = getContext<PanelContext>(PLUGIN_CONTEXT_KEY);

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
