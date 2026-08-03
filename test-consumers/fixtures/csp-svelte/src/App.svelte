<script>
    // Consume ONLY packed tarballs: the light-DOM viewer + its stylesheet from
    // `triiiceratops`, and real plugins whose CSS installs through the SDK style
    // service — under a strict CSP its install takes the nonce-aware `<style>`
    // fallback (driven by the page's <meta property="csp-nonce">).
    //
    // Two plugins, covering both CSS paths a plugin can ship:
    //   · image-manipulation installs a hand-written, namespaced global stylesheet;
    //   · pdf-export uses idiomatic Svelte `<style>` + `@triiiceratops/ui`
    //     components whose Svelte-scoped CSS is extracted at build (`bundledCss()`)
    //     and installed through the SAME service. This is the path that would
    //     otherwise be injected un-nonced by Svelte's `append_styles` and blocked
    //     by strict `style-src` — the regression this fixture guards.
    import { TriiiceratopsViewer } from 'triiiceratops/svelte';
    import 'triiiceratops/style.css';
    import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
    import { PdfExportPlugin } from '@triiiceratops/plugin-pdf-export';
</script>

<div style="width: 100vw; height: 100vh">
    <TriiiceratopsViewer
        manifestId="/manifest.json"
        theme="dark"
        plugins={[ImageManipulationPlugin, PdfExportPlugin]}
    />
</div>
