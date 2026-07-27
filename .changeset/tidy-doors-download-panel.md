---
'@triiiceratops/plugin-image-download': patch
---

Migrate the image-download plugin onto the core-owned-chrome path: it now sets the transitional `__coreChrome` marker, so core renders its toolbar button (from the plugin's icon) among the built-in buttons and owns open/close + docking. The self-rendered toggle and the corner `position: absolute` floating host are removed — `view.mount` renders only the panel content into the core-provided docked container.

The panel's presentation is restored to the pre-monorepo themed look: controls render with the shared `@triiiceratops/ui` primitives (`Button`, `Select`) against the current `--tri-` theme tokens, in a body + footer layout that matches the viewer's other docked panels. Download behavior (IIIF fetch/compositing, output formats) and the structured `pluginerror` reporting are unchanged.
