<script lang="ts">
  import { viewerState } from "../state/viewer.svelte";
</script>

<div
  class="fab fab-flower fab-top-left fixed z-[600] pointer-events-auto flex-col items-end transition-all duration-200 {viewerState.showThumbnailGallery &&
  viewerState.isGalleryDockedRight
    ? 'right-[220px]'
    : 'right-6'} {viewerState.showThumbnailGallery &&
  viewerState.isGalleryDockedBottom
    ? 'bottom-[160px]'
    : 'bottom-4'}"
  data-tip="Menu"
>
  <!-- a focusable div with tabindex is necessary to work on all browsers. role="button" is necessary for accessibility -->
  <div
    tabindex="0"
    role="button"
    class="btn btn-lg btn-primary btn-circle shadow-xl"
  >
    <!-- Plus Icon -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-8 w-8"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
      />
    </svg>
  </div>

  <!-- Main Action button replaces the original button when FAB is open -->
  <div class="fab-close">
    <span class="sr-only">Close</span>
    <span class="btn btn-circle btn-lg btn-error">✕</span>
  </div>

  <!-- buttons that show up when FAB is open -->

  <!-- Gallery Toggle -->
  <div
    class="tooltip tooltip-left"
    data-tip={viewerState.showThumbnailGallery
      ? "Hide Gallery"
      : "Show Gallery"}
  >
    <button
      aria-label={viewerState.showThumbnailGallery
        ? "Hide Gallery"
        : "Show Gallery"}
      class="btn btn-lg btn-circle shadow-lg {viewerState.showThumbnailGallery
        ? 'btn-active btn-accent'
        : 'btn-neutral'}"
      onclick={() => viewerState.toggleThumbnailGallery()}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        />
      </svg>
    </button>
  </div>

  <!-- Annotations Toggle -->
  <div
    class="tooltip tooltip-left"
    data-tip={viewerState.showAnnotations
      ? "Hide Annotations"
      : "Show Annotations"}
  >
    <button
      class="btn btn-lg btn-circle shadow-lg {viewerState.showAnnotations
        ? 'btn-active btn-secondary'
        : 'btn-neutral'}"
      onclick={() => viewerState.toggleAnnotations()}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
        />
      </svg>
    </button>
  </div>
</div>
