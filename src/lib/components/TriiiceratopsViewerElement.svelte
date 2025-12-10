<svelte:options
  customElement={{
    tag: "triiiceratops-viewer",
    shadow: "none",
    props: {
      manifestId: { attribute: "manifest-id", type: "String", reflect: true },
    },
  }}
/>

<script lang="ts">
  import TriiiceratopsViewer from "./TriiiceratopsViewer.svelte";

  let { manifestId = "" } = $props();
</script>

<div class="w-full h-full">
  <TriiiceratopsViewer {manifestId} />
</div>
