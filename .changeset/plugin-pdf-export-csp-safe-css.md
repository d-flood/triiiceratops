---
'@triiiceratops/plugin-pdf-export': patch
---

Render `@triiiceratops/ui` primitives (and the plugin's own components) with idiomatic, Svelte-scoped `<style>` blocks while staying CSP-safe under a strict `style-src`. The build extracts component CSS (`emitCss: true` + the `@triiiceratops/ui/vite` `bundledCss()` helper) into a single string installed through the root-aware, nonce-aware SDK style service, instead of Svelte's runtime `append_styles` injection (which appends an un-nonced `<style>` the browser blocks). No stray stylesheet ships; the bundle stays self-contained.
