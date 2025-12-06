<script lang="ts">
  import { viewerState } from "../state/viewer.svelte";
</script>

<div
  class="fab fab-flower fab-top-left fixed z-600 pointer-events-auto flex-col items-end transition-all duration-300 {viewerState.showSearchPanel
    ? viewerState.showThumbnailGallery && viewerState.isGalleryDockedRight
      ? 'right-[540px]'
      : 'right-[344px]'
    : viewerState.showThumbnailGallery && viewerState.isGalleryDockedRight
      ? 'right-[220px]'
      : 'right-6'} {viewerState.showThumbnailGallery &&
  viewerState.dockSide === 'bottom'
    ? 'bottom-[160px]'
    : 'bottom-6'}"
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
  <!-- Main Action button replaces the original button when FAB is open (Now acting as Search) -->
  <div class="fab-close tooltip tooltip-top" data-tip="Search">
    <button
      aria-label="Toggle Search"
      class="btn btn-circle btn-lg shadow-lg {viewerState.showSearchPanel
        ? 'btn-primary'
        : 'btn-neutral'}"
      onclick={() => viewerState.toggleSearchPanel()}
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
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    </button>
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
        ? 'btn-info'
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

  <!-- Full Screen Toggle -->
  <div
    class="tooltip tooltip-left"
    data-tip={viewerState.isFullScreen
      ? "Exit Full Screen"
      : "Enter Full Screen"}
  >
    <button
      class="btn btn-circle btn-lg shadow-lg transition-all duration-300 ease-out {viewerState.isFullScreen
        ? 'btn-warning'
        : 'btn-neutral'}"
      onclick={() => viewerState.toggleFullScreen()}
    >
      {#if viewerState.isFullScreen}
        <!-- Compress/Exit Icon -->
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
            d="M10 14H5.25m0 0l4-4m-4 4V9.25M14 10h4.75m0 0l-4-4m4 4v4.75M14 14l-4 4m0 0h-4.75m4.75 0V14m4 0l4 4m0 0v-4.75m0 4.75H14"
          />
        </svg>
      {:else}
        <!-- Expand/Enter Icon -->
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
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
          />
        </svg>
      {/if}
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
      aria-label="Toggle Annotations"
      class="btn btn-lg btn-circle shadow-lg {viewerState.showAnnotations
        ? 'btn-error'
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

  <!-- Metadata Toggle -->
  <div class="tooltip tooltip-top" data-tip="Metadata">
    <button
      aria-label="Toggle Metadata"
      class="btn btn-lg btn-circle shadow-lg {viewerState.showMetadataDialog
        ? 'btn-info'
        : 'btn-neutral'}"
      onclick={() => viewerState.toggleMetadataDialog()}
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
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
  </div>
</div>
