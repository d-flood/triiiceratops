<script lang="ts">
    import DemoHeader from '../lib/components/DemoHeader.svelte';

    let manifestUrl = $state('');
    let currentManifest = $state('');
    let canvasId = $state('');

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

    // Custom theme configuration for the "Custom Theme" demo
    // This demonstrates hex color conversion and theme customization
    const customThemeConfig = JSON.stringify({
        primary: '#e1a730',
        primaryContent: '#ffffff',
        secondary: '#264b3d',
        secondaryContent: '#ffffff',
        accent: '#16376f',
        accentContent: '#ffffff',
        neutral: '#e9d9b9',
        neutralContent: '#000000',
        base100: '#ecede7',
        base200: '#b7b7b3',
        base300: '#838381',
        baseContent: '#000000',
        info: '#254477',
        success: '#264b3d',
        warning: '#733100',
        error: '#b95527',
        radiusBox: '1.5rem',
        radiusField: '0.75rem',
        radiusSelector: '0.5rem',
        border: '2px',
    });
</script>

<div class="min-h-screen h-screen bg-base-300 flex flex-col">
    <!-- Header with input -->
    <DemoHeader
        bind:manifestUrl
        bind:viewerMode
        bind:canvasId
        onLoad={loadManifest}
    />

    <h1 class="text-3xl text-center pt-8">Triiiceratops IIIF Viewer Demo</h1>

    <!-- Viewer -->
    <main class="flex-1 relative min-h-0 p-2 lg:pb-16 lg:pt-8 lg:px-32">
        <div
            class="h-full w-full rounded-box overflow-hidden border border-base-content/10 shadow-2xl"
        >
            {#if viewerMode === 'image'}
                <triiiceratops-viewer-image
                    manifest-id={currentManifest}
                    canvas-id={canvasId}
                ></triiiceratops-viewer-image>
            {:else if viewerMode === 'custom-theme'}
                <triiiceratops-viewer-image
                    manifest-id={currentManifest}
                    canvas-id={canvasId}
                    theme-config={customThemeConfig}
                ></triiiceratops-viewer-image>
            {:else}
                <!-- Core viewer - Manual plugin injection not strictly needed for this demo toggle, 
                     but we keep it clean or could demonstrate manual injection here. 
                     For now, 'core' means NO plugin to clearly show the difference. -->
                <triiiceratops-viewer
                    manifest-id={currentManifest}
                    canvas-id={canvasId}
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
