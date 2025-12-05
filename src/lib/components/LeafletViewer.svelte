<script lang="ts">
  import { onMount } from "svelte";
  import { Map as LeafletMap, CRS, LatLngBounds, LatLng } from "leaflet";
  import "leaflet/dist/leaflet.css";
  import { IIIFLayer, type IIIFTileSource } from "./IIIFLayer";
  import AnnotationOverlay from "./AnnotationOverlay.svelte";

  let { tileSources, viewerState } = $props();

  let mapElement: HTMLElement;
  let map: LeafletMap | undefined = $state();
  let iiifLayer: IIIFLayer | undefined = $state();

  // We need to handle if tileSources is a string (URL) or object
  async function fetchInfo(source: string | object): Promise<IIIFTileSource> {
    if (typeof source === "string") {
      // If it's a URL, fetch it
      const response = await fetch(source);
      return await response.json();
    }
    return source as IIIFTileSource;
  }

  $effect(() => {
    if (!tileSources || !map) return;

    // Load the IIIF source
    (async () => {
      try {
        // Handle array or single
        const source = Array.isArray(tileSources)
          ? tileSources[0]
          : tileSources;
        const info = await fetchInfo(source);

        // Validation: Ensure we have dimensions
        if (!info || !info.width || !info.height) {
          console.error("LeafletViewer: Invalid IIIF info received", info);
          return;
        }

        if (iiifLayer) {
          map.removeLayer(iiifLayer);
        }

        iiifLayer = new IIIFLayer(info);
        iiifLayer.addTo(map);

        // Invalidate size to ensure map knows its container dimensions
        map.invalidateSize();

        // Calculate bounds using standard LatLng for CRS.Simple
        // In CRS.Simple, standard is (0,0) at top-left.
        // But for bounds fitting to work nicely with fitBounds(),
        // we generally map (0,0) to [0,0] latlng, and (w, h) to [-h, w].

        // Let's use simpler explicit coordinates that worked in earlier iterations before unproject complexity
        const southWest = new LatLng(-info.height, 0);
        const northEast = new LatLng(0, info.width);
        const bounds = new LatLngBounds(southWest, northEast);

        console.log("LeafletViewer: Fitting bounds", bounds);

        // Force map center immediately before fitting to avoid offset
        map.setView([0, 0], 0, { animate: false });
        // Invalidate size again just to be safe
        map.invalidateSize();

        map.fitBounds(bounds);
      } catch (e) {
        console.error("LeafletViewer: Error loading IIIF source:", e);
      }
    })();
  });

  onMount(() => {
    if (!mapElement) return;

    map = new LeafletMap(mapElement, {
      center: [0, 0],
      zoom: 0,
      crs: CRS.Simple,
      attributionControl: false, // Optional
      zoomControl: false,
    });

    return () => {
      map?.remove();
    };
  });
</script>

<div class="w-full h-full relative z-0">
  <div bind:this={mapElement} class="w-full h-full bg-black z-0"></div>
  <!-- Overlay needs the map instance -->
  {#if map && viewerState && iiifLayer}
    <AnnotationOverlay
      {map}
      {viewerState}
      width={iiifLayer.iiifData.width}
      height={iiifLayer.iiifData.height}
    />
  {/if}
</div>
