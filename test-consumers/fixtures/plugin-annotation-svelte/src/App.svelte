<script>
    // Consume ONLY packed tarballs: the viewer + its stylesheet from
    // `triiiceratops`, and the migrated annotation editor from its own scoped
    // package (`@triiiceratops/plugin-annotation-editor`, ESM entry). The plugin
    // is activated explicitly through the viewer's `plugins` prop and uses its
    // built-in `LocalStorageAdapter` (the packed default).
    import { TriiiceratopsViewer } from 'triiiceratops/svelte';
    import 'triiiceratops/style.css';
    import { createAnnotationEditorPlugin } from '@triiiceratops/plugin-annotation-editor';

    const annotationPlugin = createAnnotationEditorPlugin({
        tools: ['rectangle', 'point'],
        defaultTool: 'point',
    });
</script>

<div style="width: 100vw; height: 100vh">
    <TriiiceratopsViewer
        manifestId="/manifest.json"
        plugins={[annotationPlugin]}
    />
</div>
