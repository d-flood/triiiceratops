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
        const cleanup = mount(node);
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
