---
'triiiceratops': patch
---

Fix theme tokens not reaching the canvas in the Svelte (light-DOM) build. `OSDViewer`'s wrapper used the same `viewer-root` class as the real viewer root, and the published `triiiceratops/style.css` re-declares every base `--tri-*` / `--ui-*` token on that class — so the nested copy shadowed the root's `theme` prop and `themeConfig`, painting the canvas surface with the stock light `--tri-viewer-bg` (white) in every theme. The wrapper is now `osd-root`, so only the actual viewer root carries `viewer-root`.

The bug only affected the packaged Svelte distribution; the custom-element (shadow DOM) build, dev, and source were never affected. `osd-root`/`viewer-root` are internal markup details, not documented styling hooks, but the class change is observable in the DOM — if you were selecting the inner `.viewer-root` element, target `.osd-root` instead.
