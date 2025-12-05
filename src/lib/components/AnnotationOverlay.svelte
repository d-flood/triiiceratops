<script lang="ts">
  import { manifestsState } from "../state/manifests.svelte";
  import {
    LatLng,
    LayerGroup,
    Rectangle,
    SVGOverlay,
    type Map as LeafletMap,
  } from "leaflet";

  let {
    viewerState,
    map,
    width,
    height,
  }: { viewerState: any; map: LeafletMap; width: number; height: number } =
    $props();

  let annotations = $derived.by(() => {
    if (!viewerState.manifestId || !viewerState.canvasId) {
      return [];
    }
    return manifestsState.getAnnotations(
      viewerState.manifestId,
      viewerState.canvasId
    );
  });

  // State for visible annotation IDs
  let visibleAnnotationIds = $state(new Set<string>());

  // Helper to get ID from annotation object
  function getAnnotationId(anno: any): string {
    return (
      anno.id ||
      anno["@id"] ||
      (typeof anno.getId === "function" ? anno.getId() : "") ||
      ""
    );
  }

  // Effect to initialize visibility when annotations load
  $effect(() => {
    // When annotations array changes (e.g. canvas change)
    if (annotations.length > 0) {
      // Default to all visible
      // We use a new Set to trigger reactivity if needed, though $state Set is reactive on methods usually?
      // Svelte 5 Set reactivity: methods mutating it trigger updates.
      // But we should start fresh for new canvas.
      const newSet = new Set<string>();
      annotations.forEach((a: any) => {
        const id = getAnnotationId(a);
        if (id) newSet.add(id);
      });
      visibleAnnotationIds = newSet;
    } else {
      visibleAnnotationIds = new Set();
    }
  });

  // Derived state for "All Visible" status
  let isAllVisible = $derived.by(() => {
    if (annotations.length === 0) return false;
    // If visible set matches count of valid IDs
    // We can just check size if we assume all have IDs
    // Or check if every annotation id is in set
    return annotations.every((a: any) => {
      const id = getAnnotationId(a);
      return !id || visibleAnnotationIds.has(id);
    });
  });

  function toggleAnnotation(id: string) {
    if (visibleAnnotationIds.has(id)) {
      visibleAnnotationIds.delete(id);
    } else {
      visibleAnnotationIds.add(id);
    }
    // reassignment to trigger reactivity if simple mutation doesn't (Svelte 5 Set needs reassignment or proxy, let's look at docs?
    // Actually Svelte 5 $state with Set/Map: "The built-in Set and Map classes are not deeply reactive... To make them reactive, use the new SvelteSet and SvelteMap classes... OR just reassign."
    // Docs say: `let s = $state(new Set());` mutations like `s.add` are NOT reactive automatically unless using `SvelteSet`.
    // Safest is reassignment for now.
    visibleAnnotationIds = new Set(visibleAnnotationIds);
  }

  function toggleAllAnnotations() {
    if (isAllVisible) {
      // Hide all
      visibleAnnotationIds = new Set();
    } else {
      // Show all
      const newSet = new Set<string>();
      annotations.forEach((a: any) => {
        const id = getAnnotationId(a);
        if (id) newSet.add(id);
      });
      visibleAnnotationIds = newSet;
    }
  }

  // Helper to parse xywh string
  function parseRegion(
    fragment: string | undefined
  ): { x: number; y: number; w: number; h: number } | null {
    if (!fragment) return null;
    const match = fragment.match(/(?:xywh=)?(\d+),(\d+),(\d+),(\d+)/);
    if (match) {
      return {
        x: parseInt(match[1]),
        y: parseInt(match[2]),
        w: parseInt(match[3]),
        h: parseInt(match[4]),
      };
    }
    return null;
  }

  // Layer Group to hold all annotation layers
  let layerGroup: LayerGroup | undefined;

  // Effect to manage adding/removing layers based on annotations and visibility
  $effect(() => {
    if (!map) return;

    // Initialize layer group if needed
    if (!layerGroup) {
      layerGroup = new LayerGroup().addTo(map);
    }

    // Clear existing
    layerGroup.clearLayers();

    // Loop through annotations and render ONLY those that are visible
    annotations.forEach((anno: any) => {
      const id = getAnnotationId(anno);
      if (!id || !visibleAnnotationIds.has(id)) return;

      let targetId = "";
      let svgSelectorValue = "";

      // (Target extraction logic)
      // Check for SvgSelector specifically inside 'selector'
      // Normalized manifest might not have __jsonld property, or it might be complex logic
      const rawOn = anno.__jsonld?.on || anno.target; // Normalized often puts it in 'on' or 'target'

      // Helper to check object for selector
      const checkSelector = (obj: any) => {
        if (obj?.selector) {
          const sel = obj.selector;
          // Handle Array of selectors?
          // Handle item?
          const item = sel.item || sel;
          if (item.type === "SvgSelector" && item.value) {
            svgSelectorValue = item.value;
          }
        }
      };

      // Check primary target locations
      if (typeof rawOn === "object") {
        checkSelector(rawOn);
      } else if (Array.isArray(rawOn)) {
        rawOn.forEach(checkSelector);
      }

      // If no SVG found, fall back to XYWH extraction logic
      if (!svgSelectorValue) {
        // ... existing target parsing logic ...
        if (typeof anno.getTarget === "function") {
          const t = anno.getTarget();
          if (t) targetId = t;
          if (typeof t !== "string") {
            const rawOn = anno.__jsonld.on;
            if (rawOn) {
              if (typeof rawOn === "string") targetId = rawOn;
              else if (rawOn.selector) {
                const val = rawOn.selector.value || rawOn.selector.item?.value;
                if (val) targetId = targetId + "#" + val;
                else if (rawOn.full)
                  targetId = rawOn.full + "#" + (rawOn.selector.value || "");
                else targetId = "";
              }
            }
          }
        } else {
          if (anno.on) {
            if (typeof anno.on === "string") targetId = anno.on;
            else if (anno.on.selector) {
              const val =
                anno.on.selector.value || anno.on.selector.item?.value;
              if (val && val.includes("xywh=")) targetId = val;
            } else if (anno.target) {
              if (typeof anno.target === "string") targetId = anno.target;
              else if (anno.target.selector) {
                const val =
                  anno.target.selector.value ||
                  anno.target.selector.item?.value;
                if (val && val.includes("xywh=")) targetId = val;
              }
            }
          }
        }

        if (!targetId && typeof anno.getTarget !== "function") {
          if (anno.target && typeof anno.target === "string")
            targetId = anno.target;
        }
      }

      const label =
        (typeof anno.getLabel === "function" ? anno.getLabel() : anno.label) ||
        "Annotation";

      // Strategy 1: SVG Selector
      if (svgSelectorValue) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(svgSelectorValue, "image/svg+xml");
          const svgEl = doc.documentElement;

          // If the SVG contains just a path/shape without viewBox, we explicitly set it to match the canvas
          // This ensures the coordinates in the path (image pixels) align with the overlay bounds
          if (!svgEl.hasAttribute("viewBox")) {
            svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
          }

          // We apply styles to the paths ensuring they are visible and red
          // Often IIIF SVGs have no style or 'none'.
          const paths = svgEl.querySelectorAll("path, polygon, circle, rect");
          paths.forEach((p) => {
            p.setAttribute("fill", "#ef4444");
            p.setAttribute("fill-opacity", "0.2");
            p.setAttribute("stroke", "#ef4444");
            p.setAttribute("stroke-width", "2");
            p.setAttribute("vector-effect", "non-scaling-stroke"); // Keep stroke constant
          });

          // Create Overlay covering the WHOLE image (since SVG coords are usually absolute image pixels)
          const bounds = [
            [0, 0],
            [-height, width],
          ] as [[number, number], [number, number]];

          const overlay = new SVGOverlay(
            svgEl as unknown as SVGElement,
            bounds,
            {
              interactive: true,
            }
          );

          overlay.bindTooltip(label, { sticky: true, direction: "top" });
          layerGroup!.addLayer(overlay);
        } catch (e) {
          console.warn("Failed to parse SvgSelector", e);
        }
        return;
      }

      // Strategy 2: Media Fragment (Rectangle)
      let fragment = "";
      if (targetId && targetId.includes("xywh=")) {
        fragment = targetId.split("xywh=")[1];
      }

      const region = parseRegion(fragment);

      if (region) {
        // Create Leaflet Rectangle
        // Bounds: [[top-lat, left-lng], [bottom-lat, right-lng]]

        const bounds = [
          [-region.y, region.x], // Top Left
          [-(region.y + region.h), region.x + region.w], // Bottom Right
        ] as [[number, number], [number, number]];

        const rect = new Rectangle(bounds, {
          color: "#ef4444", // red-500
          weight: 2,
          fillOpacity: 0.2,
          fillColor: "#ef4444",
        });

        // Add tooltip (label)
        rect.bindTooltip(label, {
          sticky: true,
          direction: "top",
        });

        // Add popup (content) if needed
        // rect.bindPopup(...)

        // Add click interaction to highlight or select in list

        layerGroup!.addLayer(rect);
      }
    });

    return () => {
      // Cleanup on destroy logic handled by removal effect below, or if we want per-run cleanup
      // layerGroup is cleared at start of run
    };
  });

  // Cleanup on unmount
  $effect(() => {
    return () => {
      if (layerGroup && map) {
        map.removeLayer(layerGroup);
      }
    };
  });

  interface RenderedAnnotation {
    id: string; // Added ID
    content: string;
    isHtml: boolean;
    label: string;
  }

  // Cleaned up renderedAnnotations just for the List UI (no rect/geo data needed)
  let renderedAnnotations = $derived.by(() => {
    if (!annotations.length) return [];

    return annotations.map((anno: any) => {
      let content = "";
      let isHtml = false;

      // ... (Existing content extraction logic) ...
      if (typeof anno.getBody === "function") {
        const body = anno.getBody();
        if (body && body.length) {
          const getValue = (b: any) => {
            const val = b.getValue ? b.getValue() : null;
            if (val) return val;
            return "";
          };
          content = body
            .map((b: any) => getValue(b))
            .filter(Boolean)
            .join(" ");
          isHtml = body.some((b: any) => {
            const fmt = b.getFormat ? b.getFormat() : "";
            return fmt === "text/html" || fmt === "application/html";
          });
        }
        if (!content && typeof anno.getLabel === "function") {
          const label = anno.getLabel();
          if (label) content = label;
        }
      } else {
        // ... (Existing fallback logic) ...
        const getText = (r: any) => {
          if (!r) return "";
          return r.chars || r.value || r["cnt:chars"] || "";
        };
        const isHtmlFormat = (r: any) => {
          if (!r) return false;
          return r.format === "text/html" || r.type === "TextualBody";
        };
        if (anno.resource) {
          if (Array.isArray(anno.resource)) {
            content = anno.resource.map((r: any) => getText(r)).join(" ");
            if (anno.resource.some((r: any) => isHtmlFormat(r))) isHtml = true;
          } else {
            content = getText(anno.resource);
            if (isHtmlFormat(anno.resource)) isHtml = true;
          }
        } else if (anno.body) {
          if (Array.isArray(anno.body)) {
            content = anno.body.map((b: any) => getText(b)).join(" ");
            if (anno.body.some((b: any) => isHtmlFormat(b))) isHtml = true;
          } else {
            content = getText(anno.body);
            if (isHtmlFormat(anno.body)) isHtml = true;
          }
        }
        if (!content) {
          const fallback = anno.label || anno.name || anno.title;
          if (fallback)
            content = Array.isArray(fallback) ? fallback.join(" ") : fallback;
        }
      }

      return {
        id: getAnnotationId(anno),
        content,
        isHtml,
        label:
          (typeof anno.getLabel === "function"
            ? anno.getLabel()
            : anno.label) || "",
      };
    });
  });
</script>

```
<!-- No more DOM overlay div loop here -->
<!-- Just the UI toolbar and list -->

<!-- Debug/Info Count -->
<!-- Unified Annotation Toolbar -->
{#if annotations.length > 0}
  <div class="absolute top-4 right-4 z-[500] pointer-events-auto">
    <!-- z-index increased for Leaflet (z-400 is map) -->
    <details class="group relative">
      <summary
        class="flex items-center gap-2 bg-base-200/90 backdrop-blur shadow-lg rounded-full px-4 py-2 cursor-pointer list-none hover:bg-base-200 transition-all select-none border border-base-300 pointer-events-auto"
      >
        <!-- Toggle Button -->
        <button
          class="btn btn-xs btn-circle btn-ghost"
          onclick={(e) => {
            e.preventDefault();
            toggleAllAnnotations();
          }}
          title={isAllVisible ? "Hide All Annotations" : "Show All Annotations"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {#if isAllVisible}
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            {:else}
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.059 10.059 0 013.999-5.325m4.314-1.351A10.054 10.054 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.058 10.058 0 01-2.105 3.86m-3.71 3.71a3 3 0 00-4.242 0"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 3l18 18"
              />
            {/if}
          </svg>
        </button>

        <!-- Badge Text -->
        <span class="text-sm font-medium">
          {annotations.length} Annotations
          <span class="opacity-50 text-xs font-normal ml-1">
            ({visibleAnnotationIds.size} visible)
          </span>
        </span>

        <!-- Chevron indicator -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 opacity-50 transition-transform group-open:rotate-180"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </summary>

      <!-- Expanded List -->
      <div
        class="absolute right-0 mt-2 w-96 bg-base-200/95 backdrop-blur shadow-xl rounded-box p-0 max-h-[60vh] overflow-y-auto border border-base-300 flex flex-col divide-y divide-base-300"
      >
        {#each renderedAnnotations as anno, i}
          {@const isVisible = visibleAnnotationIds.has(anno.id)}
          <!-- List Item Row: Click toggles visibility -->
          <button
            class="w-full text-left p-3 hover:bg-base-300 transition-colors cursor-pointer flex gap-3 group/item items-start focus:outline-none focus:bg-base-300"
            onclick={(e) => {
              // Prevent default to avoid any weird form submission or details toggling behaviors if any
              e.preventDefault();
              toggleAnnotation(anno.id);
            }}
          >
            <!-- Visual Toggle Indicator (formerly a button) -->
            <div
              class="btn btn-xs btn-circle btn-ghost mt-0.5 shrink-0 pointer-events-none"
            >
              {#if isVisible}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 text-primary"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path
                    fill-rule="evenodd"
                    d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 opacity-40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.059 10.059 0 013.999-5.325m4.314-1.351A10.054 10.054 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.058 10.058 0 01-2.105 3.86m-3.71 3.71a3 3 0 00-4.242 0"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 3l18 18"
                  />
                </svg>
              {/if}
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between">
                <span class="font-bold text-sm text-primary">#{i + 1}</span>
                <!-- Only show label separately if it's different from the content being displayed -->
                {#if anno.label && anno.label !== anno.content}
                  <span class="text-xs opacity-50 truncate max-w-[150px]"
                    >{anno.label}</span
                  >
                {/if}
              </div>
              <div
                class="text-sm prose prose-sm max-w-none prose-p:my-0 prose-a:text-blue-500 break-words text-left {isVisible
                  ? ''
                  : 'opacity-50'}"
              >
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {#if anno.isHtml}
                  {@html anno.content}
                {:else}
                  {anno.content || "(No content)"}
                {/if}
              </div>
            </div>
          </button>
        {/each}
        {#if renderedAnnotations.length === 0 && annotations.length > 0}
          <div class="p-4 text-center opacity-50 text-sm">
            Annotations are hidden or off-screen.
          </div>
        {/if}
      </div>
    </details>
  </div>
{/if}
