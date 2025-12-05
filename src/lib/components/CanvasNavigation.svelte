<script>
  let { viewerState } = $props();
</script>

<div
  class="absolute left-1/2 -translate-x-1/2 bg-base-200/90 backdrop-blur rounded-full shadow-lg px-4 py-2 flex items-center gap-4 z-10 border border-base-300 transition-all duration-200 {viewerState.showThumbnailGallery &&
  viewerState.isGalleryDockedBottom
    ? 'bottom-[160px]'
    : 'bottom-4'}"
>
  <button
    class="btn btn-circle btn-sm btn-ghost"
    disabled={!viewerState.hasPrevious}
    onclick={() => viewerState.previousCanvas()}
    aria-label="Previous Canvas"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-5 w-5"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fill-rule="evenodd"
        d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
        clip-rule="evenodd"
      />
    </svg>
  </button>

  <span class="text-sm font-mono tabular-nums">
    {viewerState.currentCanvasIndex + 1} / {viewerState.canvases.length}
  </span>

  <button
    class="btn btn-circle btn-sm btn-ghost"
    disabled={!viewerState.hasNext}
    onclick={() => viewerState.nextCanvas()}
    aria-label="Next Canvas"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-5 w-5"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fill-rule="evenodd"
        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
        clip-rule="evenodd"
      />
    </svg>
  </button>
</div>
