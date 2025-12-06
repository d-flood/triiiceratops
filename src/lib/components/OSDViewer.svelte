<script lang="ts">
  import { onMount } from "svelte";
  import OpenSeadragon from "openseadragon";
  import { createOSDAnnotator } from "@annotorious/openseadragon";
  import "@annotorious/openseadragon/annotorious-openseadragon.css";
  import { convertAnnotations } from "../utils/annotationAdapter";
  import { manifestsState } from "../state/manifests.svelte";
  import type { ViewerState } from "../state/viewer.svelte";

  let {
    tileSources,
    viewerState,
  }: { tileSources: string | object | null; viewerState: ViewerState } =
    $props();

  let container: HTMLElement | undefined = $state();
  let viewer: OpenSeadragon.Viewer | undefined = $state();
  let anno: ReturnType<typeof createOSDAnnotator> | undefined = $state();

  // Tooltip state
  let hoveredAnnotation: any = $state(null);
  let tooltipPos = $state({ x: 0, y: 0 });

  // Get all annotations for current canvas (manifest + search)
  let allAnnotations = $derived.by(() => {
    if (!viewerState.manifestId || !viewerState.canvasId) {
      return [];
    }
    const manifestAnnotations = manifestsState.getAnnotations(
      viewerState.manifestId,
      viewerState.canvasId,
    );
    const searchAnnotations = viewerState.currentCanvasSearchAnnotations;
    return [...manifestAnnotations, ...searchAnnotations];
  });

  // Get search hit IDs for styling
  let searchHitIds = $derived.by(() => {
    const ids = new Set<string>();
    viewerState.currentCanvasSearchAnnotations.forEach((anno: any) => {
      const id = anno.id || anno["@id"];
      if (id) ids.add(id);
    });
    return ids;
  });

  // Convert to Annotorious format
  let annotoriousAnnotations = $derived.by(() => {
    return convertAnnotations(allAnnotations, searchHitIds);
  });

  onMount(() => {
    if (!container) return;

    // Initialize OpenSeadragon viewer
    viewer = OpenSeadragon({
      element: container,
      tileSources: null, // Will be set via effect
      prefixUrl: "", // No navigation UI images needed
      showNavigationControl: false,
      showHomeControl: false,
      showFullPageControl: false,
      showSequenceControl: false,
      showZoomControl: false,
      showRotationControl: false,
      animationTime: 0.5,
      springStiffness: 7.0,
      zoomPerClick: 2.0,
    });

    // Initialize Annotorious
    anno = createOSDAnnotator(viewer, {
      drawingEnabled: false, // Read-only mode
    });

    // Hover events for tooltip
    anno.on("mouseEnterAnnotation", (annotation) => {
      hoveredAnnotation = annotation;
    });

    anno.on("mouseLeaveAnnotation", () => {
      hoveredAnnotation = null;
    });

    // Track pointer position for tooltip
    if (container) {
      container.addEventListener("pointermove", (e) => {
        const rect = container!.getBoundingClientRect();
        tooltipPos = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      });
    }

    return () => {
      anno?.destroy();
      viewer?.destroy();
    };
  });

  // Load tile source when it changes
  $effect(() => {
    if (!viewer || !tileSources) return;

    viewer.open(tileSources);
  });

  // Load annotations when they change
  $effect(() => {
    if (!anno) return;

    anno.setAnnotations(annotoriousAnnotations);
  });

  // Dynamic styling: red for regular, yellow for search hits
  $effect(() => {
    if (!anno) return;

    anno.setStyle((annotation) => {
      const isSearchHit = annotation.bodies?.some(
        (b) => b.purpose === "search-hit",
      );
      return {
        fill: isSearchHit ? "#facc15" : "#ef4444",
        fillOpacity: isSearchHit ? 0.4 : 0.2,
        stroke: isSearchHit ? "#facc15" : "#ef4444",
        strokeWidth: isSearchHit ? 1 : 2,
      };
    });
  });

  // Filtering: show based on visibility state
  $effect(() => {
    if (!anno) return;

    // Explicitly track dependencies so the effect re-runs
    const showAnnotations = viewerState.showAnnotations;
    const visibleIds = viewerState.visibleAnnotationIds;

    anno.setFilter((annotation) => {
      // Always show search hits
      if (annotation.bodies?.some((b) => b.purpose === "search-hit")) {
        return true;
      }

      // Hide all if annotations are toggled off
      if (!showAnnotations) {
        return false;
      }

      // Check visibility set
      return visibleIds.has(annotation.id);
    });
  });

  // Helper to get annotation content for tooltip
  function getAnnotationContent(annotation: any): string {
    if (!annotation.bodies || annotation.bodies.length === 0) {
      return "Annotation";
    }

    // Get first non-search-hit body
    const body = annotation.bodies.find((b) => b.purpose === "commenting");
    return body?.value || "Annotation";
  }
</script>

<div class="w-full h-full relative">
  <div bind:this={container} class="w-full h-full bg-base-100"></div>

  <!-- Hover Tooltip (Option A: positioned div) -->
  {#if hoveredAnnotation && viewerState.showAnnotations}
    <div
      class="absolute bg-base-200 text-base-content px-3 py-2 rounded-lg shadow-lg text-sm max-w-xs pointer-events-none z-[1000]"
      style="left: {tooltipPos.x + 15}px; top: {tooltipPos.y + 15}px;"
    >
      {getAnnotationContent(hoveredAnnotation)}
    </div>
  {/if}
</div>
