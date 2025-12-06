<script>
  import MiradorViewer from "./lib/components/MiradorViewer.svelte";
  import ThemeToggle from "./lib/components/ThemeToggle.svelte";
</script>

<main
  class="min-h-screen bg-base-200 font-sans text-base-content flex flex-col"
>
  <!-- Fake Site Header -->
  <header class="bg-neutral text-neutral-content p-4 shadow-lg z-10">
    <div class="max-w-7xl mx-auto flex justify-between items-center px-4">
      <div class="flex items-center gap-2">
        <!-- Logo Icon -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="w-8 h-8"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z"
          />
        </svg>

        <span class="text-xl font-bold tracking-tight"
          >Museum of Digital Artifacts</span
        >
      </div>
      <ThemeToggle />
    </div>
  </header>

  <!-- Page Content -->
  <div
    class="flex-1 max-w-7xl mx-auto w-full p-6 md:p-8 grid lg:grid-cols-12 gap-8"
  >
    <!-- Sidebar / Context -->
    <aside class="lg:col-span-4 space-y-6">
      <article class="prose prose-sm md:prose-base">
        <h1>Collection Highlights</h1>
        <p>
          Welcome to our digital reading room. This page demonstrates how the
          <strong>Tiiirex Viewer</strong> can be embedded directly into a content-rich
          website.
        </p>
        <p>
          The viewer to the right displays a 17th-century manuscript from the
          Wellcome Collection. It features:
        </p>
        <ul>
          <li>Deep Zoom (IIIF)</li>
          <li>Full-text Search</li>
          <li>Annotation Display</li>
          <li>Metadata Exploration</li>
        </ul>
        <h3>About the Item</h3>
        <p>
          This item is loaded via a IIIF Manifest. The viewer handles scaling,
          tiling, and interaction independently of the main page flow.
        </p>
      </article>

      <div class="card bg-base-100 shadow-xl border border-base-300">
        <div class="card-body p-6">
          <h2 class="card-title text-base flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="w-5 h-5 text-primary"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
            Interaction Tips
          </h2>
          <p class="text-sm">
            Use the <strong>Flower Menu</strong> in the top-left of the viewer to
            access tools like Search and Gallery.
          </p>
          <div class="card-actions justify-end mt-2">
            <button class="btn btn-primary btn-xs btn-outline"
              >Learn More</button
            >
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Viewer Area -->
    <section class="lg:col-span-8 flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold">Manuscript Viewer</h2>
        <div class="badge badge-secondary badge-outline font-mono text-xs">
          v1.0.0-demo
        </div>
      </div>

      <!-- EMBEDDED VIEWER CONTAINER -->
      <!-- We give it a fixed height relative to viewport or pixels to simulate a "frame" -->
      <div
        class="bg-base-100 rounded-xl shadow-2xl overflow-hidden border border-base-300 relative h-[700px] w-full isolate"
      >
        <!-- isolate creates a stacking context so viewer fixed elements don't escape randomly if z-index is messed up relative to page headers? 
             Actually fixed elements inside might relate to viewport. 
             If viewer uses 'fixed', it will escape this container.
             The viewer uses 'absolute' for panels? FloatingMenu uses 'fixed'.
             Changing FloatingMenu to 'absolute' might be needed if we want it contained?
             User manual said "embedded". Usually embedded viewers want controls INSIDE the box.
             If FloatingMenu is 'fixed', it floats on screen.
             If the viewer is scrolled out of view, the FAB stays? 
             That might be annoying.
             Let's check FloatingMenu css. It has `fixed`.
             For a true component, it should probably be `absolute` relative to the container.
             I won't change FloatingMenu logic right now unless requested, but usually embedded components shouldn't own the viewport fixed layer.
             However, user request didn't strictly say "constrain controls".
             But "boundaries ... obvious" implies separation.
             If I scroll the page, the "Fixed" menu will follow.
             
             Let's stick to modifying App.svelte first.
        -->
        <MiradorViewer
          manifestId="https://iiif.wellcomecollection.org/presentation/v2/b18035723"
        />
      </div>
      <p class="text-xs text-center opacity-50 italic">
        Powered by Tiiirex IIIF Viewer
      </p>
    </section>
  </div>

  <footer
    class="footer footer-center p-6 bg-base-300 text-base-content mt-auto"
  >
    <div>
      <p class="font-bold">Museum of Digital Artifacts</p>
      <p>Copyright © 2025 - All rights reserved</p>
    </div>
  </footer>
</main>
