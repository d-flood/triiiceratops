<script lang="ts">
  import { viewerState } from "../state/viewer.svelte";

  let { canvases } = $props();

  let isOpen = $state(false);
  let position = $state({ x: 20, y: 100 });
  let size = $state({ width: 300, height: 400 });
  let isDragging = $state(false);
  let isResizing = $state(false);
  let dragOffset = { x: 0, y: 0 };
  let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

  // Generate thumbnail data
  let thumbnails = $derived.by(() => {
    if (!canvases) return [];
    return canvases.map((canvas: any, index: number) => {
      // Manifesto getThumbnail logic
      // Try getCanonicalImageUri or standard thumb
      let src = "";
      try {
        // Prefer a small width around 200
        if (canvas.getCanonicalImageUri) {
          src = canvas.getCanonicalImageUri(200);
        } else if (canvas.getThumbnail) {
          const thumb = canvas.getThumbnail();
          if (thumb) {
            src = typeof thumb === "string" ? thumb : thumb.id || thumb["@id"];
          }
        }
      } catch (e) {
        console.warn("Error getting thumbnail", e);
      }

      // Fallback to first image if no thumbnail service
      if (!src) {
        const images = canvas.getImages();
        if (images && images.length > 0) {
          const res = images[0].getResource();
          if (res && res.getServices().length > 0) {
            // Construct IIIF URL roughly
            const serviceId = res.getServices()[0].id;
            src = `${serviceId}/full/200,/0/default.jpg`;
          } else if (res && res.id) {
            src = res.id; // full image as fallback (bad for perf but works)
          }
        }
      }

      return {
        id: canvas.id,
        label: canvas.getLabel().length
          ? canvas.getLabel()[0].value
          : `Canvas ${index + 1}`,
        src,
        index,
      };
    });
  });

  function startDrag(e: MouseEvent) {
    if ((e.target as HTMLElement).closest(".resize-handle")) return; // Don't drag if resizing
    isDragging = true;
    dragOffset = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", stopDrag);
  }

  function onDrag(e: MouseEvent) {
    if (!isDragging) return;
    position.x = e.clientX - dragOffset.x;
    position.y = e.clientY - dragOffset.y;
  }

  function stopDrag() {
    isDragging = false;
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", stopDrag);
  }

  function startResize(e: MouseEvent) {
    e.stopPropagation(); // Prevent drag
    isResizing = true;
    resizeStart = {
      x: e.clientX,
      y: e.clientY,
      w: size.width,
      h: size.height,
    };
    window.addEventListener("mousemove", onResize);
    window.addEventListener("mouseup", stopResize);
  }

  function onResize(e: MouseEvent) {
    if (!isResizing) return;
    const dx = e.clientX - resizeStart.x;
    const dy = e.clientY - resizeStart.y;
    size.width = Math.max(200, resizeStart.w + dx);
    size.height = Math.max(200, resizeStart.h + dy);
  }

  function stopResize() {
    isResizing = false;
    window.removeEventListener("mousemove", onResize);
    window.removeEventListener("mouseup", stopResize);
  }

  function selectCanvas(canvasId: string) {
    viewerState.canvasId = canvasId;
  }
</script>

{#if viewerState.showThumbnailGallery}
  <!-- Floating Window -->
  <div
    class="fixed z-[900] bg-base-100 shadow-2xl rounded-lg flex flex-col border border-base-300 overflow-hidden"
    style="left: {position.x}px; top: {position.y}px; width: {size.width}px; height: {size.height}px;"
  >
    <!-- Header (Draggable) -->
    <div
      class="bg-base-200 p-2 cursor-move flex items-center justify-between select-none border-b border-base-300"
      onmousedown={startDrag}
      role="button"
      tabindex="0"
    >
      <div class="flex items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 opacity-50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
        <span class="font-bold text-sm">Gallery</span>
        <span class="text-xs opacity-50">{thumbnails.length} items</span>
      </div>
      <button
        class="btn btn-ghost btn-xs btn-circle"
        onclick={() => viewerState.toggleThumbnailGallery()}
        aria-label="Close Gallery"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </div>

    <!-- Content (Grid) -->
    <div class="flex-1 overflow-y-auto p-4 bg-base-100">
      <div
        class="grid gap-4"
        style="grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));"
      >
        {#each thumbnails as thumb}
          <button
            class="group flex flex-col gap-2 p-2 rounded hover:bg-base-200 transition-colors text-left relative {viewerState.canvasId ===
            thumb.id
              ? 'ring-2 ring-primary bg-primary/5'
              : ''}"
            onclick={() => selectCanvas(thumb.id)}
            aria-label="Select canvas {thumb.label}"
          >
            <div
              class="aspect-4/3 bg-base-300 rounded overflow-hidden relative w-full flex items-center justify-center"
            >
              {#if thumb.src}
                <img
                  src={thumb.src}
                  alt={thumb.label}
                  class="object-contain w-full h-full"
                  loading="lazy"
                />
              {:else}
                <span class="opacity-20 text-4xl">?</span>
              {/if}
            </div>
            <div
              class="text-xs font-medium truncate w-full opacity-70 group-hover:opacity-100"
            >
              {thumb.label}
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Resize Handle -->
    <div
      class="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize resize-handle bg-accent hover:bg-accent-focus transition-colors z-50"
      style="clip-path: polygon(100% 0, 0 100%, 100% 100%);"
      onmousedown={startResize}
      role="button"
      tabindex="0"
      aria-label="Resize"
    ></div>
  </div>
{/if}
