<script lang="ts">
    /*
     * Single-glyph wrapper around the internal Icon renderer. Exists so a fixed
     * icon can be passed as a `Component` value (e.g. `PanelStackItem.icon` and
     * the `PluginDef.icon` seam), which renders it as `<Icon size=… weight=… />`.
     */
    import type { ComponentProps } from 'svelte';
    import Icon from '../../components/Icon.svelte';

    let {
        size,
        weight,
        color,
        class: className,
        label,
    }: Omit<ComponentProps<typeof Icon>, 'name'> = $props();
</script>

<Icon name="DownloadSimple" {size} {weight} {color} class={className} {label} />
