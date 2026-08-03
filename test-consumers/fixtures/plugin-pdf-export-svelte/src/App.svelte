<script>
    // Consume ONLY packed tarballs: the viewer + its stylesheet from
    // `triiiceratops`, and the migrated plugin from its own scoped package
    // (`@triiiceratops/plugin-pdf-export`, ESM entry). The plugin is activated
    // explicitly by passing it to the viewer's `plugins` prop. `pdf-lib` is the
    // plugin package's OWN dependency (it left core's graph, ticket 16).
    import { TriiiceratopsViewer } from 'triiiceratops/svelte';
    import 'triiiceratops/style.css';
    import { PdfExportPlugin } from '@triiiceratops/plugin-pdf-export';
</script>

<div style="width: 100vw; height: 100vh">
    <TriiiceratopsViewer
        manifestId="/manifest.json"
        plugins={[PdfExportPlugin]}
    />
</div>
