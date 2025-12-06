<script>
  import MiradorViewer from "./lib/components/MiradorViewer.svelte";
  import ThemeToggle from "./lib/components/ThemeToggle.svelte";
</script>

<main
  class="h-screen w-screen flex flex-col overflow-hidden bg-base-100 text-base-content"
>
  <header class="navbar bg-base-200 shadow-md z-10">
    <div class="flex-1">
      <a href="/" class="btn btn-ghost text-xl">Tiiirex</a>
    </div>
    <div class="flex-none gap-2">
      <ThemeToggle />
    </div>
  </header>

  <div class="flex-1 relative overflow-hidden">
    <MiradorViewer
      manifestId="https://iiif.wellcomecollection.org/presentation/v2/b18035723"
    />
  </div>
</main>
