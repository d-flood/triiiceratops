---
'@triiiceratops/plugin-image-manipulation': patch
---

The image-manipulation Flyout is now idiomatic Svelte: it renders the shared
`@triiiceratops/ui` `Range` (the three vertical sliders, rotated −90°) and
`Tooltip` (the invert/grayscale/reset actions), and moves its layout into a
Svelte-scoped `<style>` block. The component CSS (its own plus the bundled UI
primitives') is extracted at build time (`emitCss: true` + the
`@triiiceratops/ui/vite` `bundledCss()` helper) and installed through the
root-aware, nonce-aware SDK style service, so it stays CSP-safe under a strict
`style-src` and ships no stray stylesheet. Presentation only — filter behavior
(live apply, linger on close, reset on canvas-change/deactivation, restore on
reopen) is unchanged.
