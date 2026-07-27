---
'@triiiceratops/plugin-pdf-export': patch
'@triiiceratops/plugin-image-download': patch
'@triiiceratops/plugin-annotation-editor': patch
---

Plugins now render `@triiiceratops/ui` primitives (and their own components) with
idiomatic, Svelte-scoped `<style>` blocks while staying CSP-safe under a strict
`style-src`. The build extracts component CSS (`emitCss: true` + the new
`@triiiceratops/ui/vite` `bundledCss()` helper) into a single string that each
plugin installs through the root-aware, nonce-aware SDK style service, instead of
Svelte's runtime `append_styles` injection (which appends an un-nonced `<style>`
the browser blocks). No stray stylesheet ships; the bundle stays self-contained.
