<script>
    // Consume ONLY the packed tarball's public surface:
    //   - the Svelte component export
    //   - the documented stylesheet export
    import { TriiiceratopsViewer } from 'triiiceratops/svelte';
    import 'triiiceratops/style.css';
</script>

<div style="width: 100vw; height: 100vh">
    <TriiiceratopsViewer manifestId="/manifest.json" />
</div>
