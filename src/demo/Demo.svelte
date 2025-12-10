<script lang="ts">
    // Import the custom element to register it
    import '../lib/custom-element';

    import DemoHeader from '../lib/components/DemoHeader.svelte';

    let manifestUrl = $state(
        'https://iiif.wellcomecollection.org/presentation/v2/b18035723',
    );
    let currentManifest = $state(
        'https://iiif.wellcomecollection.org/presentation/v2/b18035723',
    );

    function loadManifest() {
        currentManifest = manifestUrl;
    }
</script>

<div class="min-h-screen h-screen bg-base-300 flex flex-col">
    <!-- Header with input -->
    <DemoHeader bind:manifestUrl onLoad={loadManifest} />

    <!-- Viewer -->
    <main class="flex-1 relative min-h-0 py-16 px-32">
        <div
            class="h-full w-full rounded-box overflow-hidden border border-base-content/10 shadow-xl"
        >
            <triiiceratops-viewer manifest-id={currentManifest}
            ></triiiceratops-viewer>
        </div>
    </main>
</div>

<style>
    triiiceratops-viewer {
        display: block;
        width: 100%;
        height: 100%;
    }
</style>
