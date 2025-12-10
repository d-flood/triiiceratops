<script>
  import TriiiceratopsViewer from "./lib/components/TriiiceratopsViewer.svelte";
  import ThemeToggle from "./lib/components/ThemeToggle.svelte";
</script>

<main class="h-screen w-screen bg-base-300 p-8 md:p-16 flex flex-col relative">
  <!-- Theme Toggle in corner -->
  <div class="absolute top-4 right-4 z-50">
    <ThemeToggle />
  </div>

  <!-- Viewer Container -->
  <div
    class="flex-1 bg-base-100 rounded-2xl shadow-2xl overflow-hidden border border-base-content/10 relative isolate"
  >
    <TriiiceratopsViewer
      manifestId="https://iiif.wellcomecollection.org/presentation/v2/b18035723"
    />
  </div>
</main>
