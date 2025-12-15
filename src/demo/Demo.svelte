<script lang="ts">
    import DemoHeader from '../lib/components/DemoHeader.svelte';

    // We can import plugins here since we are in the same codebase
    // In a real-world scenario, the user would bundle these or load them
    import { ImageManipulationPlugin } from '../lib/plugins/image-manipulation';

    let manifestUrl = $state('');
    let currentManifest = $state('');

    // Reference to the custom element
    let viewerElement: HTMLElement | undefined = $state();

    // Instantiate plugin
    const imagePlugin = new ImageManipulationPlugin();

    function loadManifest() {
        currentManifest = manifestUrl;
    }

    // This defines <triiiceratops-viewer> and <triiiceratops-viewer-image>
    import('../lib/custom-element');
    import('../lib/custom-element-image');

    // Initialize mode from URL, default to 'image'
    const urlParams = new URLSearchParams(window.location.search);
    let viewerMode = $state(urlParams.get('mode') || 'image');
    let isInitialLoad = true;

    // Handle mode changes by reloading the page
    $effect(() => {
        if (isInitialLoad) {
            isInitialLoad = false;
            return;
        }
        // When viewerMode changes (via binding from Header), reload page
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('mode', viewerMode);
        window.location.href = newUrl.toString();
    });
</script>

<div class="min-h-screen h-screen bg-base-300 flex flex-col">
    <!-- Header with input -->
    <DemoHeader bind:manifestUrl bind:viewerMode onLoad={loadManifest} />

    <h1 class="text-3xl text-center pt-8">Triiiceratops IIIF Viewer Demo</h1>

    <!-- Viewer -->
    <main class="flex-1 relative min-h-0 p-2 lg:pb-16 lg:pt-8 lg:px-32">
        <div
            class="h-full w-full rounded-box overflow-hidden border border-base-content/10 shadow-2xl"
        >
            {#if viewerMode === 'image'}
                <triiiceratops-viewer-image manifest-id={currentManifest}
                ></triiiceratops-viewer-image>
            {:else}
                <!-- Core viewer - Manual plugin injection not strictly needed for this demo toggle, 
                     but we keep it clean or could demonstrate manual injection here. 
                     For now, 'core' means NO plugin to clearly show the difference. -->
                <triiiceratops-viewer manifest-id={currentManifest}
                ></triiiceratops-viewer>
            {/if}
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
