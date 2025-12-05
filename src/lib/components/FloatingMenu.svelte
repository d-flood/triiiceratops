<script lang="ts">
  import { viewerState } from "../state/viewer.svelte";

  let isOpen = $state(false);

  function toggleMenu() {
    isOpen = !isOpen;
  }
</script>

```
<div
  class="fixed bottom-6 right-6 z-[600] pointer-events-auto flex flex-col items-end"
>
  <div class="relative w-16 h-16">
    <!-- Main Toggle Button -->
    <button
      class="btn btn-lg btn-circle btn-primary shadow-xl z-50 relative transition-transform duration-300 {isOpen
        ? 'rotate-45'
        : 'rotate-0'}"
      onclick={toggleMenu}
      aria-label={isOpen ? "Close Menu" : "Open Menu"}
    >
      {#if isOpen}
        <!-- X Icon -->
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
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      {:else}
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
      {/if}
    </button>

    <!-- Gallery Toggle (Top-ish position) -->
    <button
      class="btn btn-circle btn-lg absolute top-0 left-0 shadow-lg transition-all duration-300 ease-out z-40 {viewerState.showThumbnailGallery
        ? 'btn-active btn-accent'
        : 'btn-neutral'}"
      style="transform: {isOpen
        ? 'translate(0px, -75px)'
        : 'translate(0,0) scale(0)'}; opacity: {isOpen ? 1 : 0};"
      onclick={() => viewerState.toggleThumbnailGallery()}
      title={viewerState.showThumbnailGallery ? "Hide Gallery" : "Show Gallery"}
      tabindex={isOpen ? 0 : -1}
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
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        />
      </svg>
    </button>

    <!-- Annotations Toggle (Left-ish position) -->
    <button
      class="btn btn-circle btn-lg absolute top-0 left-0 shadow-lg transition-all duration-300 ease-out z-40 {viewerState.showAnnotations
        ? 'btn-active btn-secondary'
        : 'btn-neutral'}"
      style="transform: {isOpen
        ? 'translate(-70px, -30px)'
        : 'translate(0,0) scale(0)'}; opacity: {isOpen ? 1 : 0};"
      onclick={() => viewerState.toggleAnnotations()}
      title={viewerState.showAnnotations
        ? "Hide Annotations"
        : "Show Annotations"}
      tabindex={isOpen ? 0 : -1}
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
```
