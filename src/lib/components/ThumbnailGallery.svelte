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
  let galleryElement: HTMLElement | undefined = $state();

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

  function onDrag(e: MouseEvent) {
    if (!isDragging) return;

    let newX = e.clientX - dragOffset.x;
    let newY = e.clientY - dragOffset.y;

    // Constrain to parent container
    if (galleryElement && galleryElement.parentElement) {
      const parent = galleryElement.parentElement;
      // Use clientWidth/Height to exclude borders if any, which is usually correct for absolute positioning containment
      const maxX = Math.max(0, parent.clientWidth - size.width);
      const maxY = Math.max(0, parent.clientHeight - size.height);

      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));
    }

    position.x = newX;
    position.y = newY;
  }

  function stopDrag() {
    const dropTarget = dragOverSide;
    isDragging = false;
    dragOverSide = null;
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", stopDrag);

    // Commit drop
    if (dropTarget) {
      dockSide = dropTarget;
    }
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

  // State for docking
  let dockSide = $state<"top" | "bottom" | "left" | "right" | "none">("bottom");
  let dragOverSide = $state<"top" | "bottom" | "left" | "right" | null>(null);

  // Sync dock state to viewer state
  $effect(() => {
    viewerState.dockSide = dockSide;
    viewerState.isGalleryDockedBottom = dockSide === "bottom";
    viewerState.isGalleryDockedRight = dockSide === "right";
  });

  // Switch to horizontal layout if height is small or docked to top/bottom
  let isHorizontal = $derived(
    dockSide === "top" ||
      dockSide === "bottom" ||
      (dockSide === "none" && size.height < 320)
  );

  function startDrag(e: MouseEvent) {
    if ((e.target as HTMLElement).closest(".resize-handle")) return; // Don't drag if resizing

    // If dragging while docked, undock immediately
    if (dockSide !== "none") {
      dockSide = "none";

      const parentRect =
        galleryElement?.parentElement?.getBoundingClientRect() || {
          left: 0,
          top: 0,
        };

      // Reset to default floating size and position centered on mouse
      size = { width: 300, height: 400 };
      position = {
        x: e.clientX - parentRect.left - 150, // Center width
        y: e.clientY - parentRect.top - 20, // Offset slightly from top
      };
    }

    isDragging = true;
    dragOffset = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", stopDrag);
  }
</script>

{#if viewerState.showThumbnailGallery}
  <!-- Floating Window -->
  <div
    bind:this={galleryElement}
    class={(dockSide !== "none"
      ? `absolute z-900 bg-base-100 shadow-xl border-base-300 flex transition-all duration-200 
           ${dockSide === "bottom" ? "flex-row bottom-0 left-0 right-0 h-[140px] border-t" : ""}
           ${dockSide === "top" ? "flex-row top-0 left-0 right-0 h-[140px] border-b" : ""}
           ${dockSide === "left" ? "flex-col left-0 top-0 bottom-0 w-[200px] border-r" : ""}
           ${dockSide === "right" ? `flex-col top-0 bottom-0 w-[200px] border-l ${viewerState.showSearchPanel ? "right-80" : "right-0"}` : ""}`
      : "absolute z-900 bg-base-100 shadow-2xl rounded-lg flex flex-col border border-base-300 overflow-hidden") +
      (isDragging ? " pointer-events-none opacity-80" : "")}
    style={dockSide !== "none"
      ? ""
      : `left: ${position.x}px; top: ${position.y}px; width: ${size.width}px; height: ${size.height}px;`}
  >
    <!-- Close Button (Absolute, always top-right of container) -->
    <button
      class="absolute top-1 right-1 btn btn-ghost btn-xs btn-circle z-20"
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

    <!-- Header Area -->
    <div
      class={"bg-base-100 flex shrink-0 select-none relative " +
        (dockSide === "bottom" || dockSide === "top"
          ? "flex-row h-full items-center border-r border-base-200"
          : "flex-col w-full border-b border-base-200")}
    >
      <!-- Drag Handle -->
      <div
        class={"cursor-move flex items-center justify-center hover:bg-base-200/50 active:bg-base-200 transition-colors " +
          (dockSide === "bottom" || dockSide === "top"
            ? "w-8 h-full"
            : "h-6 w-full")}
        onmousedown={startDrag}
        role="button"
        tabindex="0"
        aria-label="Drag Gallery"
      >
        <div
          class={"bg-base-300 rounded-full " +
            (dockSide === "bottom" || dockSide === "top"
              ? "w-1.5 h-12"
              : "w-12 h-1.5")}
        ></div>
      </div>
    </div>

    <!-- Content (Grid or Horizontal Scroll) -->
    <div
      class="flex-1 p-2 bg-base-100 {isHorizontal
        ? 'overflow-x-auto overflow-y-hidden'
        : 'overflow-y-auto overflow-x-hidden'}"
    >
      <div
        class={isHorizontal
          ? "flex flex-row gap-2 h-full items-center"
          : "grid gap-2"}
        style={isHorizontal
          ? ""
          : "grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));"}
      >
        {#each thumbnails as thumb}
          <button
            class="group flex flex-col gap-2 p-2 rounded hover:bg-base-200 transition-colors text-left relative shrink-0 {isHorizontal
              ? 'w-[140px]'
              : ''} {viewerState.canvasId === thumb.id
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
              <span class="font-bold mr-1">{thumb.index + 1}.</span>
              {thumb.label}
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Resize Handle -->
    {#if dockSide === "none"}
      <div
        class="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize resize-handle bg-accent hover:bg-accent-focus transition-colors z-50"
        style="clip-path: polygon(100% 0, 0 100%, 100% 100%);"
        onmousedown={startResize}
        role="button"
        tabindex="0"
        aria-label="Resize"
      ></div>
    {/if}
  </div>

  {#if isDragging}
    <!-- Drop Zones -->
    <!-- Top -->
    <div
      class="absolute top-2 left-2 right-2 h-16 rounded-xl border-4 border-dashed border-primary/40 z-950 flex items-center justify-center transition-all duration-200 {dragOverSide ===
      'top'
        ? 'bg-primary/20 scale-105'
        : 'bg-base-100/50'}"
      onmouseenter={() => (dragOverSide = "top")}
      onmouseleave={() => (dragOverSide = null)}
      role="group"
    >
      <span class="font-bold text-primary opacity-50">Dock Top</span>
    </div>

    <!-- Bottom -->
    <div
      class="absolute bottom-2 left-2 right-2 h-16 rounded-xl border-4 border-dashed border-primary/40 z-950 flex items-center justify-center transition-all duration-200 {dragOverSide ===
      'bottom'
        ? 'bg-primary/20 scale-105'
        : 'bg-base-100/50'}"
      onmouseenter={() => (dragOverSide = "bottom")}
      onmouseleave={() => (dragOverSide = null)}
      role="group"
    >
      <span class="font-bold text-primary opacity-50">Dock Bottom</span>
    </div>

    <!-- Left -->
    <div
      class="absolute top-2 bottom-2 left-2 w-16 rounded-xl border-4 border-dashed border-primary/40 z-950 flex items-center justify-center transition-all duration-200 {dragOverSide ===
      'left'
        ? 'bg-primary/20 scale-105'
        : 'bg-base-100/50'}"
      onmouseenter={() => (dragOverSide = "left")}
      onmouseleave={() => (dragOverSide = null)}
      role="group"
    >
      <span
        class="font-bold text-primary opacity-50 vertical-rl rotate-180"
        style="writing-mode: vertical-rl;">Dock Left</span
      >
    </div>

    <!-- Right -->
    <div
      class="absolute top-2 bottom-2 w-16 rounded-xl border-4 border-dashed border-primary/40 z-950 flex items-center justify-center transition-all duration-300 {viewerState.showSearchPanel
        ? 'right-[328px]'
        : 'right-2'} {dragOverSide === 'right'
        ? 'bg-primary/20 scale-105'
        : 'bg-base-100/50'}"
      onmouseenter={() => (dragOverSide = "right")}
      onmouseleave={() => (dragOverSide = null)}
      role="group"
    >
      <span
        class="font-bold text-primary opacity-50 vertical-rl rotate-180"
        style="writing-mode: vertical-rl;">Dock Right</span
      >
    </div>
  {/if}
{/if}
