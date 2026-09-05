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

<style>
    /*
        Everything this panel renders sits inside this padding, so a section
        added later inherits it rather than having to remember it.

        `--ui-panel-header-pad` is CORE's token — the very one the section header
        above this content is padded with (`PanelStackSection.svelte`) — so the
        transcript's inset matches the space beside the panel's icon and close
        button by construction instead of by a matching literal that would drift
        the first time core retuned its chrome. The fallback is core's own.

        Not set on core's `.content` wrapper one level further up, which would be
        the general fix: the core panels and two of the export plugins already
        pad themselves, so a padding there would double on all of them.
    */
    .tri-av-panel {
        padding: var(--ui-panel-header-pad, 0.75rem);
        /* The header owns the space above, so doubling it here would set the
           transcript further from its own heading than from the panel edges. */
        padding-top: 0;
    }
</style>
