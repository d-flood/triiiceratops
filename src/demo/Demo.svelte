<script lang="ts">
  // Import the custom element to register it
  import "../lib/custom-element";

  import ThemeToggle from "../lib/components/ThemeToggle.svelte";

  let manifestUrl = $state(
    "https://iiif.wellcomecollection.org/presentation/v2/b18035723"
  );
  let currentManifest = $state(
    "https://iiif.wellcomecollection.org/presentation/v2/b18035723"
  );

  function loadManifest() {
    currentManifest = manifestUrl;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      loadManifest();
    }
  }
</script>

<div class="min-h-screen h-screen bg-base-300 flex flex-col">
  <!-- Header with input -->
  <header class="p-4 bg-base-200 flex gap-4 items-center shrink-0">
    <label
      for="manifest-input"
      class="text-base-content text-sm whitespace-nowrap">IIIF Manifest:</label
    >
    <input
      id="manifest-input"
      type="text"
      bind:value={manifestUrl}
      onkeydown={handleKeydown}
      placeholder="Enter IIIF manifest URL"
      class="input input-bordered flex-1"
    />
    <button onclick={loadManifest} class="btn btn-primary"> Load </button>
    <ThemeToggle />
  </header>

  <!-- Viewer -->
  <main class="flex-1 relative min-h-0">
    <triiiceratops-viewer manifest-id={currentManifest}></triiiceratops-viewer>
  </main>
</div>

<style>
  triiiceratops-viewer {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
