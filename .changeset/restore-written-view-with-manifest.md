---
'triiiceratops': minor
---

With `write-content-state-to-url` on, a URL content state for the host's own manifest now restores its canvas, region and time on reload, even when `manifest-id`, `canvas-id` or `initial-canvas-region` is set. A URL content state for a different manifest is ignored when the host names one.
