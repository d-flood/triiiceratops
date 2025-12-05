<script>
    import { viewerState } from "../state/viewer.svelte";
    import OSDViewer from "./OSDViewer.svelte";
    import CanvasNavigation from "./CanvasNavigation.svelte";
    import AnnotationOverlay from "./AnnotationOverlay.svelte";

    let { manifestId } = $props();

    $effect(() => {
        if (manifestId) {
            viewerState.setManifest(manifestId);
        }
    });

    let manifestData = $derived(viewerState.manifest);
    let canvases = $derived(viewerState.canvases);
    let currentCanvasIndex = $derived(viewerState.currentCanvasIndex);

    let tileSources = $derived.by(() => {
        console.log("MiradorViewer: calculating tileSources");
        console.log("MiradorViewer: canvases", canvases);
        console.log("MiradorViewer: currentCanvasIndex", currentCanvasIndex);

        if (
            !canvases ||
            currentCanvasIndex === -1 ||
            !canvases[currentCanvasIndex]
        ) {
            console.log("MiradorViewer: No canvas found");
            return null;
        }

        const canvas = canvases[currentCanvasIndex];
        console.log("MiradorViewer: canvas", canvas);

        // Use Manifesto to get images
        // canvas is a Manifesto Canvas object
        const images = canvas.getImages();
        if (!images || !images.length) {
            console.log("MiradorViewer: No images in canvas");
            return null;
        }

        const annotation = images[0];
        const resource = annotation.getResource();
        if (!resource) {
            console.log("MiradorViewer: No resource in annotation");
            return null;
        }

        const service = resource.getService();

        if (service) {
            let id = service.id;
            if (id && !id.endsWith("/info.json")) {
                id = `${id}/info.json`;
            }
            console.log("MiradorViewer: Found service ID", id);
            return id;
        } else {
            const url = resource.id;
            console.log("MiradorViewer: Found image URL", url);
            return { type: "image", url };
        }
        console.log("MiradorViewer: No service or ID found");
        return null;
    });
</script>

<div class="w-full h-full relative bg-black flex items-center justify-center">
    {#if manifestData?.isFetching}
        <span class="loading loading-spinner loading-lg text-primary"></span>
    {:else if manifestData?.error}
        <div class="text-error">Error: {manifestData.error}</div>
    {:else if tileSources}
        <OSDViewer {tileSources} {viewerState} />
    {:else}
        <div class="text-base-content/50">No image found</div>
    {/if}

    {#if canvases.length > 1}
        <CanvasNavigation {viewerState} />
    {/if}
</div>
