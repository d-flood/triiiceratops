<script>
    import { onMount } from 'svelte';
    import { TriiiceratopsViewer } from 'triiiceratops/svelte';
    import 'triiiceratops/style.css';
    import { ImageDownloadPlugin } from '@triiiceratops/plugin-image-export';
    import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
    import { PdfExportPlugin } from '@triiiceratops/plugin-pdf-export';
    import { AnnotationEditorPlugin } from '@triiiceratops/plugin-annotation-editor';
    import { AvPlugin } from '@triiiceratops/plugin-av';

    const plugins = [
        ImageManipulationPlugin,
        ImageDownloadPlugin,
        PdfExportPlugin,
        AnnotationEditorPlugin,
        AvPlugin,
    ];

    let element;
    let viewerState;
    $: window.__componentViewerState = viewerState;

    // Dynamically imported so the element artifact, with its own bundled
    // Svelte, lands in a chunk of its own the harness can tell apart.
    onMount(async () => {
        await import('triiiceratops/element/register');
        element.plugins = plugins;
    });
</script>

<div style="display: flex; width: 100vw; height: 100vh">
    <div id="component-host" style="flex: 1; min-width: 0">
        <TriiiceratopsViewer
            manifestId="/manifest.json"
            {plugins}
            bind:viewerState
        />
    </div>
    <triiiceratops-viewer
        bind:this={element}
        manifest-id="/manifest.json"
        style="display: block; flex: 1; min-width: 0"
    ></triiiceratops-viewer>
</div>
