---
'@triiiceratops/plugin-pdf-export': minor
---

Migrated onto core's first-party viewport API: what the reader is currently looking at comes from `viewportBounds` and `containerSize` rather than from a raw OpenSeadragon viewport, and no renderer object is touched. The plugin declares no `requiredCapabilities` — the retired `osd@5` is gone, and core's own surface is negotiated by `coreRange`.
