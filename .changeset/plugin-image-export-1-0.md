---
'@triiiceratops/plugin-image-export': major
---

`@triiiceratops/plugin-image-export` 1.0.

- Migrated onto core's first-party image surface, reached through the
  framework-neutral `triiiceratops/image-export` toolkit. OpenSeadragon is gone
  from the viewer, and with it the `osd@5` capability: the plugin declares no
  `requiredCapabilities` and states compatibility with a `coreRange` floor alone.
- `MULTI_CANVAS_GAP` is gone; multi-canvas spacing is a `gap` option on core's
  `getCanvasDisplayLayouts`, which the plugin passes through.
- Alert text in the download panel is legible under the dark themes.
