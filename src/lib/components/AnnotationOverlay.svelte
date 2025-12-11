<script lang="ts">
  import { getContext } from "svelte";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import Eye from "phosphor-svelte/lib/Eye";
  import EyeSlash from "phosphor-svelte/lib/EyeSlash";
  import { manifestsState } from "../state/manifests.svelte";
  import { VIEWER_STATE_KEY, type ViewerState } from "../state/viewer.svelte";

  const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

  let annotations = $derived.by(() => {
    if (!viewerState.manifestId || !viewerState.canvasId) {
      return [];
    }
    const manifestAnnotations = manifestsState.getAnnotations(
      viewerState.manifestId,
      viewerState.canvasId
    );
    // Add search hits for current canvas
    // These behave as ephemeral annotations
    const searchAnnotations = viewerState.currentCanvasSearchAnnotations;

    return [...manifestAnnotations, ...searchAnnotations];
  });

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
      const newSet = new Set<string>();
      annotations.forEach((a: any) => {
        const id = getAnnotationId(a);
        if (id) newSet.add(id);
      });
      viewerState.visibleAnnotationIds = newSet;
    } else {
      viewerState.visibleAnnotationIds = new Set();
    }
  });

  // Derived state for "All Visible" status
  let isAllVisible = $derived.by(() => {
    if (annotations.length === 0) return false;
    return annotations.every((a: any) => {
      const id = getAnnotationId(a);
      return !id || viewerState.visibleAnnotationIds.has(id);
    });
  });

  function toggleAnnotation(id: string) {
    if (viewerState.visibleAnnotationIds.has(id)) {
      viewerState.visibleAnnotationIds.delete(id);
    } else {
      viewerState.visibleAnnotationIds.add(id);
    }
    // Reassign to trigger reactivity
    viewerState.visibleAnnotationIds = new Set(
      viewerState.visibleAnnotationIds
    );
  }

  function toggleAllAnnotations() {
    if (isAllVisible) {
      // Hide all
      viewerState.visibleAnnotationIds = new Set();
    } else {
      // Show all
      const newSet = new Set<string>();
      annotations.forEach((a: any) => {
        const id = getAnnotationId(a);
        if (id) newSet.add(id);
      });
      viewerState.visibleAnnotationIds = newSet;
    }
  }

  // Cleaned up renderedAnnotations just for the List UI (no rect/geo data needed)
  let renderedAnnotations = $derived.by(() => {
    if (!annotations.length) return [];

    return annotations.map((anno: any) => {
      let content = "";
      let isHtml = false;

      // Extract content (support IIIF v2 and v3)
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
        // Raw JSON Parsing (Fallback)
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

<!-- Unified Annotation Toolbar -->
{#if viewerState.showAnnotations}
  <div class="absolute top-4 right-4 z-500 pointer-events-auto">
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
          {#if isAllVisible}
            <Eye size={16} weight="bold" />
          {:else}
            <EyeSlash size={16} weight="bold" />
          {/if}
        </button>

        <!-- Badge Text -->
        <span class="text-sm font-medium">
          {annotations.length} Annotations
          <span class="opacity-50 text-xs font-normal ml-1">
            ({viewerState.visibleAnnotationIds.size} visible)
          </span>
        </span>

        <CaretDown
          size={16}
          weight="bold"
          class="group-open:rotate-180 transition-transform opacity-80"
        />
      </summary>

      <!-- Expanded List -->
      <div
        class="absolute right-0 mt-2 w-96 bg-base-200/95 backdrop-blur shadow-xl rounded-box p-0 max-h-[60vh] overflow-y-auto border border-base-300 flex flex-col divide-y divide-base-300"
      >
        {#each renderedAnnotations as anno, i}
          {@const isVisible = viewerState.visibleAnnotationIds.has(anno.id)}
          <!-- List Item Row: Click toggles visibility -->
          <button
            class="w-full text-left p-3 hover:bg-base-300 transition-colors cursor-pointer flex gap-3 group/item items-start focus:outline-none focus:bg-base-300"
            onclick={(e) => {
              e.preventDefault();
              toggleAnnotation(anno.id);
            }}
          >
            <!-- Visual Toggle Indicator (formerly a button) -->
            <div
              class="btn btn-xs btn-circle btn-ghost mt-0.5 shrink-0 pointer-events-none"
            >
              {#if isVisible}
                <Eye size={16} weight="bold" />
              {:else}
                <EyeSlash size={16} weight="bold" />
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
                class="text-sm prose prose-sm max-w-none prose-p:my-0 prose-a:text-blue-500 wrap-break-word text-left {isVisible
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
        {:else}
          <div class="p-4 text-center opacity-50 text-sm">
            No annotations available.
          </div>
        {/each}
      </div>
    </details>
  </div>
{/if}
