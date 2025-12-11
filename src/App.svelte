<script>
    import DemoHeader from './lib/components/DemoHeader.svelte';
    import TriiiceratopsViewer from './lib/components/TriiiceratopsViewer.svelte';

    let manifestUrl = $state('');
    let currentManifest = $state('');

    function loadManifest() {
        currentManifest = manifestUrl;
    }
</script>

<div class="min-h-screen h-screen bg-base-300 flex flex-col">
    <!-- Header with input -->
    <DemoHeader bind:manifestUrl onLoad={loadManifest} />

    <h1 class="text-3xl font-bold text-center pt-8">
        Triiiceratops IIIF Viewer Demo
    </h1>

    <!-- Viewer -->
    <main class="flex-1 relative min-h-0 py-16 px-32">
        <div
            class="h-full w-full rounded-box overflow-hidden border border-primary/20 shadow-xl"
        >
            <TriiiceratopsViewer manifestId={currentManifest} />
        </div>
    </main>
</div>
