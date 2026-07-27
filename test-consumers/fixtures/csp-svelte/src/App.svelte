<script>
    // Consume ONLY packed tarballs: the light-DOM viewer + its stylesheet from
    // `triiiceratops`, and a real plugin (`@triiiceratops/plugin-image-manipulation`)
    // that installs global CSS through the SDK style service — under a strict CSP
    // its install takes the nonce-aware `<style>` fallback (driven by the page's
    // <meta property="csp-nonce">).
    import { TriiiceratopsViewer } from 'triiiceratops';
    import 'triiiceratops/style.css';
    import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
</script>

<div style="width: 100vw; height: 100vh">
    <TriiiceratopsViewer
        manifestId="/manifest.json"
        theme="dark"
        plugins={[ImageManipulationPlugin]}
    />
</div>
