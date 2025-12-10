<script lang="ts">
  import { getContext } from "svelte";
  import { VIEWER_STATE_KEY, type ViewerState } from "../state/viewer.svelte";

  const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

  let manifest = $derived(viewerState.manifest);

  // Helper to extract metadata
  let metadata = $derived.by(() => {
    if (!manifest) return [];

    // Manifesto's getMetadata() returns an array of { label: ..., value: ... } objects
    // The values might be strings or arrays of objects (LanguageMap)
    const rawMetadata = manifest.getMetadata();

    if (!rawMetadata) return [];

    return rawMetadata.map((item: any) => {
      let label = "";
      let value = "";

      // Handle Label
      if (item.getLabel) {
        // Manifesto helper
        const l = item.getLabel();
        if (Array.isArray(l)) {
          label = l.map((x: any) => x.value).join(" ");
        } else {
          label = l;
        }
      } else if (item.label) {
        // Fallback
        // Could be string or language map
        if (typeof item.label === "string") label = item.label;
        else if (Array.isArray(item.label))
          label = item.label.map((x: any) => x.value).join(" ");
        else label = String(item.label); // simplified
      }

      // Handle Value
      if (item.getValue) {
        const v = item.getValue();
        if (Array.isArray(v)) {
          value = v.map((x: any) => x.value).join(" ");
        } else {
          value = v;
        }
      } else if (item.value) {
        if (typeof item.value === "string") value = item.value;
        else if (Array.isArray(item.value))
          value = item.value.map((x: any) => x.value).join(" ");
        else value = String(item.value);
      }

      // Cleanup HTML if needed? Manifesto usually returns raw text or HTML.
      // Svelte's @html can handle it if we trust the source.

      return { label, value };
    });
  });

  // Also get top-level description, attribution, license/rights
  let description = $derived(manifest ? manifest.getDescription() : "");
  let attribution = $derived(
    manifest ? manifest.getRequiredStatement()?.getValue() : ""
  );
  // getRequiredStatement usually returns { label: ..., value: ... } or similar structure that supports getValue()

  let license = $derived(manifest ? manifest.getLicense() : "");
</script>

<!-- Modal -->
<dialog
  class="modal absolute"
  open={viewerState.showMetadataDialog}
  style="position: absolute;"
>
  <div class="modal-box w-11/12 max-w-5xl">
    <form method="dialog">
      <button
        class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
        onclick={() => viewerState.toggleMetadataDialog()}>✕</button
      >
    </form>

    <h3 class="font-bold text-lg mb-4">
      {manifest
        ? manifest.getLabel().length
          ? manifest.getLabel()[0].value
          : "Manifest Metadata"
        : "Loading..."}
    </h3>

    <div class="py-4 overflow-y-auto max-h-[70vh]">
      {#if description}
        <div class="mb-6 prose">
          <p>{@html description}</p>
        </div>
      {/if}

      <dl class="grid grid-cols-1 md:grid-cols-[200px_1fr]">
        {#if attribution}
          <dt class="font-bold text-lg opacity-70 mt-6">Attribution</dt>
          <dd class="text-sm ps-2">{@html attribution}</dd>
        {/if}

        {#if license}
          <dt class="font-bold text-lg opacity-70 mt-6">License</dt>
          <dd class="text-sm ps-2">
            <a
              href={license}
              target="_blank"
              rel="noreferrer"
              class="link link-primary break-all">{license}</a
            >
          </dd>
        {/if}

        {#each metadata as item}
          <dt class="font-bold text-lg opacity-70 mt-6">{item.label}</dt>
          <dd class="text-sm ps-2">{@html item.value}</dd>
        {/each}
      </dl>
    </div>

    <div class="modal-action">
      <form method="dialog">
        <button class="btn" onclick={() => viewerState.toggleMetadataDialog()}
          >Close</button
        >
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button onclick={() => viewerState.toggleMetadataDialog()}>close</button>
  </form>
</dialog>
