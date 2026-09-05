---
'@triiiceratops/plugin-image-manipulation': minor
---

Migrated onto core's first-party image surface. Adjustments are applied through `ViewerState.setImageAdjustments({ brightness, contrast, saturation, invert, grayscale })` and `resetImageAdjustments()` rather than by reaching into the renderer's drawer for its DOM node and writing a CSS filter string onto it, so the adjustment set is viewer state: readable, replayed onto a renderer that mounts later, and testable with no renderer at all. The plugin declares no `requiredCapabilities` — the retired `osd@5` is gone, and core's own surface is negotiated by `coreRange`.
