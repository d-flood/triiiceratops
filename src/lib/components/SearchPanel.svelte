<script lang="ts">
  import { getContext } from "svelte";
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import { VIEWER_STATE_KEY, type ViewerState } from "../state/viewer.svelte";

  const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

  // We'll initialize from viewerState to preserve context.
  let query = $state(viewerState.searchQuery);

  function handleSearch() {
    viewerState.search(query);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      handleSearch();
    }
  }

  function navigate(result: any) {
    const canvas = viewerState.canvases[result.canvasIndex];
    if (canvas) {
      viewerState.canvasId = canvas.id;
    }
  }
</script>

<!-- Drawer / Panel -->
{#if viewerState.showSearchPanel}
  <div
    class="absolute top-0 right-0 h-full w-80 bg-base-200 shadow-2xl z-1000 transform transition-transform duration-300 flex flex-col border-l border-base-300"
    role="dialog"
    aria-label="Search Panel"
  >
    <!-- Header -->
    <div class="p-4 bg-base-300 flex justify-between items-center shrink-0">
      <h2 class="font-bold text-lg">Search</h2>
      <button
        class="btn btn-sm btn-circle btn-ghost"
        onclick={() => viewerState.toggleSearchPanel()}
        aria-label="Close Search">✕</button
      >
    </div>

    <!-- Search Input -->
    <div class="p-4 border-b border-base-300 shrink-0">
      <div class="join w-full">
        <input
          type="text"
          placeholder="Search content..."
          class="input input-bordered join-item w-full"
          bind:value={query}
          onkeydown={handleKeydown}
        />
        <button
          class="btn btn-primary join-item"
          onclick={handleSearch}
          aria-label="Search"
        >
          {#if viewerState.isSearching}
            <span class="loading loading-spinner loading-xs"></span>
          {:else}
            <MagnifyingGlass size={20} weight="bold" />
          {/if}
        </button>
      </div>
    </div>

    <!-- Results -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      {#if viewerState.isSearching}
        <div class="flex justify-center p-8">
          <span class="loading loading-spinner loading-lg text-primary"></span>
        </div>
      {:else if viewerState.searchResults.length === 0 && viewerState.searchQuery}
        <div class="text-center opacity-50 p-4">
          No results found for "{viewerState.searchQuery}"
        </div>
      {:else if viewerState.searchResults.length === 0 && !viewerState.searchQuery}
        <div class="text-center opacity-50 p-4 text-sm">
          Enter a search term to find occurrences within this manifest.
        </div>
      {:else}
        <!-- Results Header -->
        <div class="text-xs font-bold opacity-50 uppercase tracking-wider pb-2">
          {viewerState.searchResults.length} Results
        </div>

        {#each viewerState.searchResults as result, i}
          <button
            class="w-full text-left card bg-base-100 shadow hover:shadow-md transition-all p-4 text-sm group border border-transparent hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            onclick={() => navigate(result)}
          >
            <div class="flex justify-between items-baseline mb-1">
              <span
                class="font-bold text-xs opacity-70 bg-base-200 px-1.5 py-0.5 rounded"
                >{result.canvasLabel}</span
              >
            </div>

            {#if result.type === "hit"}
              <div class="leading-relaxed">
                <span>{@html result.before}</span>
                <span
                  class="bg-yellow-200 text-yellow-900 font-bold px-0.5 rounded"
                  >{@html result.match}</span
                >
                <span>{@html result.after}</span>
              </div>
            {:else}
              <div class="leading-relaxed">
                {result.match}
              </div>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  </div>
{/if}
