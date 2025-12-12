<script lang="ts">
    // Import the custom element to register it
    import '../lib/custom-element';

    import DemoHeader from '../lib/components/DemoHeader.svelte';

    let manifestUrl = $state('');
    let currentManifest = $state('');

    function loadManifest() {
        currentManifest = manifestUrl;
    }
</script>

<div class="min-h-screen h-screen bg-base-300 flex flex-col">
    <!-- Header with input -->
    <DemoHeader bind:manifestUrl onLoad={loadManifest} />

    <h1 class="text-3xl text-center pt-8">Triiiceratops IIIF Viewer Demo</h1>

    <!-- Viewer -->
    <main class="flex-1 relative min-h-0 p-2 lg:pb-16 lg:pt-8 lg:px-32">
        <div
            class="h-full w-full rounded-box overflow-hidden border border-base-content/10 shadow-2xl"
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
