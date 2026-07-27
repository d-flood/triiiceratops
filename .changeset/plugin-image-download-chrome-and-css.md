---
'@triiiceratops/plugin-image-download': patch
---

Migrate onto the core-owned-chrome path: core renders the toolbar button (from the plugin's icon) among the built-in buttons and owns open/close + docking. The self-rendered toggle and the corner `position: absolute` floating host are removed — `view.mount` renders only the panel content into the core-provided docked container. The panel's presentation is restored to the pre-monorepo themed look: controls render with the shared `@triiiceratops/ui` primitives (`Button`, `Select`) against the current `--tri-` theme tokens, in a body + footer layout matching the viewer's other docked panels, with idiomatic Svelte-scoped `<style>` blocks whose CSS is extracted at build time and installed through the root-aware, nonce-aware SDK style service (CSP-safe under a strict `style-src`, no stray stylesheet). Download behavior (IIIF fetch/compositing, output formats) and the structured `pluginerror` reporting are unchanged.
