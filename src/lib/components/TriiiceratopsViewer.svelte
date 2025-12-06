<script lang="ts">
  import { viewerState } from "../state/viewer.svelte";
  import OSDViewer from "./OSDViewer.svelte";
  import CanvasNavigation from "./CanvasNavigation.svelte";
  import AnnotationOverlay from "./AnnotationOverlay.svelte";
  import ThumbnailGallery from "./ThumbnailGallery.svelte";
  import FloatingMenu from "./FloatingMenu.svelte";
  import MetadataDialog from "./MetadataDialog.svelte";
  import SearchPanel from "./SearchPanel.svelte";

  let { manifestId } = $props();

  $effect(() => {
    if (manifestId) {
      viewerState.setManifest(manifestId);
    }
  });

  $effect(() => {
    const handleFullScreenChange = () => {
      viewerState.isFullScreen = !!document.fullscreenElement;
    };
    document.addEventListener("fullscreenchange", handleFullScreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
    };
  });

  let manifestData = $derived(viewerState.manifest);
  let canvases = $derived(viewerState.canvases);
  let currentCanvasIndex = $derived(viewerState.currentCanvasIndex);

  let tileSources = $derived.by(() => {
    console.log("TriiiceratopsViewer: calculating tileSources");
    console.log("TriiiceratopsViewer: canvases", canvases);
    console.log("TriiiceratopsViewer: currentCanvasIndex", currentCanvasIndex);

    if (
      !canvases ||
      currentCanvasIndex === -1 ||
      !canvases[currentCanvasIndex]
    ) {
      console.log("TriiiceratopsViewer: No canvas found");
      return null;
    }

    const canvas = canvases[currentCanvasIndex];
    console.log("TriiiceratopsViewer: canvas", canvas);

    // Use Manifesto to get images
    // canvas is a Manifesto Canvas object
    const images = canvas.getImages();
    if (!images || !images.length) {
      console.log("TriiiceratopsViewer: No images in canvas");
      return null;
    }

    const annotation = images[0];
    const resource = annotation.getResource();
    if (!resource) {
      console.log("TriiiceratopsViewer: No resource in annotation");
      return null;
    }

    // Start of service detection logic
    const service = resource.getService();
    if (service) {
      let id = service.id;
      if (id && !id.endsWith("/info.json")) {
        id = `${id}/info.json`;
      }
      console.log("TriiiceratopsViewer: Found service ID", id);
      return id;
    }

    // Fallback: Check for array of services (Manifesto sometimes puts them here)
    const services = resource.getServices();
    if (services && services.length > 0) {
      let id = services[0].id;
      if (id && !id.endsWith("/info.json")) {
        id = `${id}/info.json`;
      }
      console.log("TriiiceratopsViewer: Found service ID from list", id);
      return id;
    }

    // Fallback: Heuristic from Image ID (if it looks like IIIF)
    if (resource.id && resource.id.includes("/iiif/")) {
      // Try to strip standard IIIF parameters to find base
      // IIIF URLs often look like .../identifier/region/size/rotation/quality.format
      // We look for the part before the region (often 'full')
      const parts = resource.id.split("/");
      // find index of 'full' or region
      const regionIndex = parts.findIndex(
        (p: string) => p === "full" || p.match(/^\d+,\d+,\d+,\d+$/)
      );
      if (regionIndex > 0) {
        const base = parts.slice(0, regionIndex).join("/");
        console.log("TriiiceratopsViewer: Inferred service ID from URL", base);
        return `${base}/info.json`;
      }
    }

    console.log("TriiiceratopsViewer: No service or ID found, returning raw URL");
    const url = resource.id;
    return { type: "image", url };
  });
</script>

<div
  id="triiiceratops-viewer"
  class="w-full h-full relative !bg-base-100 flex items-center justify-center"
  data-theme="dark"
>
  {#if manifestData?.isFetching}
    <span class="loading loading-spinner loading-lg text-primary"></span>
  {:else if manifestData?.error}
    <div class="text-error">Error: {manifestData.error}</div>
  {:else if tileSources}
    {#key tileSources}
      <OSDViewer {tileSources} {viewerState} />
    {/key}
  {:else}
    <div class="text-base-content/50">No image found</div>
  {/if}

  {#if canvases.length > 1}
    <CanvasNavigation {viewerState} />
    <ThumbnailGallery {canvases} />
  {/if}

  <AnnotationOverlay {viewerState} />
  <MetadataDialog />
  <SearchPanel />
  <!-- Global Floating Menu -->
  <FloatingMenu />
</div>
