<script>
    // Consume ONLY packed tarballs: the viewer + its stylesheet from
    // `triiiceratops`, and the migrated plugin from its own scoped package
    // (`@triiiceratops/plugin-image-download`, ESM entry). The plugin is
    // activated explicitly by passing it to the viewer's `plugins` prop.
    import { TriiiceratopsViewer } from 'triiiceratops';
    import 'triiiceratops/style.css';
    import { ImageDownloadPlugin } from '@triiiceratops/plugin-image-download';
</script>

<div style="width: 100vw; height: 100vh">
    <TriiiceratopsViewer
        manifestId="/manifest.json"
        plugins={[ImageDownloadPlugin]}
    />
</div>
