---
'triiiceratops': patch
---

Fix theme tokens not reaching the canvas in the Svelte (light-DOM) build. The
previous renderer's wrapper `div` used the same `viewer-root` class as the real
viewer root, and the published `triiiceratops/style.css` re-declares every base
`--tri-*` / `--ui-*` token on that class — so the nested copy shadowed the root's
`theme` prop and `themeConfig`, painting the canvas surface with the stock light
`--tri-viewer-bg` (white) in every theme. Only the actual viewer root carries
`viewer-root` now.

The bug only affected the packaged Svelte distribution; the custom-element
(shadow DOM) build, dev, and source were never affected. Nothing here is a
documented styling hook: the nested wrapper is gone from this release entirely,
along with the renderer it belonged to, so there is no inner `.viewer-root`
element left to select.
