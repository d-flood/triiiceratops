<script>
    import OpenSeadragon from "openseadragon";
    import { onMount } from "svelte";
    import AnnotationOverlay from "./AnnotationOverlay.svelte";

    let { tileSources, viewerState } = $props();
    let element;
    let viewer = $state();

    $effect(() => {
        console.log(
            "OSDViewer effect run. tileSources:",
            tileSources,
            "viewer:",
            !!viewer,
        );
        if (viewer && tileSources) {
            console.log("OSDViewer opening:", tileSources);
            viewer.open(tileSources);
        }
    });

    onMount(() => {
        viewer = OpenSeadragon({
            element,
            tileSources,
            prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
            showNavigationControl: false,
            crossOriginPolicy: "Anonymous",
        });

        return () => {
            if (viewer) viewer.destroy();
        };
    });
</script>

<div class="w-full h-full relative">
    <div bind:this={element} class="w-full h-full"></div>
    {#if viewer && viewerState}
        <AnnotationOverlay {viewer} {viewerState} />
    {/if}
</div>
