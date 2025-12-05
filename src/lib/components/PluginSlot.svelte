<script>
    import { pluginState } from "../state/plugins.svelte";

    let { slotId, props = {} } = $props();

    let plugins = $derived(pluginState.getPlugins(slotId));
</script>

{#each plugins as Plugin}
    <Plugin {...props} />
{/each}
