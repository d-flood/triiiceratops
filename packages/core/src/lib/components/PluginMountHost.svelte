<script lang="ts">
    /*
     * Content adapter for the SDK core-owned-chrome path (epic
     * restore-plugin-toolbar-chrome, ticket 02). The one core chrome rendering
     * path (plugin buttons + flyouts/panels) renders this host, which bridges to
     * the plugin's framework-neutral DOM-mount thunk.
     *
     * Container provisioning is reactive: this component renders the content
     * container node and an attachment invokes the plugin's mount thunk when the
     * node appears and its cleanup when the node goes away (open→mount,
     * close→unmount, and re-mount if a layout change recreates the node). The
     * plugin's per-viewer Activation state lives above this mount (in the plugin's
     * activation scope), so a remount rebuilds content without losing state.
     */
    import { untrack } from 'svelte';

    import type { PluginMountThunk } from '../types/plugin';

    interface Props {
        /** Core-owned DOM-mount thunk: renders content into the node, returns cleanup. */
        mount: PluginMountThunk;
        // The shared chrome path spreads flyout/panel props (placement, close,
        // locale, embedded, …) onto whichever component it renders; accept and
        // ignore the rest so those extra props do not warn.
        [key: string]: unknown;
    }

    let { mount }: Props = $props();

    function attach(node: HTMLElement): () => void {
        // Read the thunk INSIDE the tracked scope, so replacing it remounts —
        // and then call it UNTRACKED.
        //
        // An attachment re-runs when anything it read while running changes, and
        // what a plugin's thunk reads is not ours to bound. A plugin building its
        // DOM will read viewer state while it does so — the active canvas, the
        // manifest, its own selected data — and every one of those is a reactive
        // `command` member, so without this each would silently become a remount
        // trigger: turning a page would tear that plugin's DOM and any state it
        // holds in closures down and rebuild it. `untrack` is what makes the
        // documented contract true: this host mounts when its node appears and
        // unmounts when the node goes away, and nothing a plugin reads on the way
        // through changes that. See `PluginMountHost.svelte.test.ts`.
        //
        // This is prophylaxis, not a fix for an observed remount in core's own
        // callers: core's chrome and overlay-layer thunks only re-parent an
        // element they already hold and read nothing reactive, and `canvasToScreen`
        // — the read an overlay layer's first placement makes — goes through
        // `rendererPort`, which is deliberately NOT reactive state (see
        // `state/viewer.svelte.ts`), so a manifest change was never propagating
        // through here. The guarantee is for third-party thunks.
        const thunk = mount;
        const cleanup = untrack(() => thunk(node));
        return () => {
            if (typeof cleanup === 'function') cleanup();
        };
    }
</script>

<div class="tri-plugin-mount" {@attach attach}></div>

<style>
    .tri-plugin-mount {
        display: contents;
    }
</style>
