---
'@triiiceratops/plugin-image-export': minor
---

Migrated onto core's first-party viewport API, with no renderer object touched and no `requiredCapabilities` declared. Multi-canvas export now lays out from manifest Canvas geometry through core's one layout implementation rather than reconstructing the viewer's spacing itself: `getCanvasDisplayLayouts` takes `gap` as an option (defaulting to what the viewer lays out with) in place of the removed `MULTI_CANVAS_GAP` export, and `ResolvedCanvasImage` gains `height` for the image's box on its canvas. Also fixes unreadable result and error alert text in the download panel under the dark themes: those alerts coloured their text with on-accent foregrounds, which measured as low as 1.11:1 against the alert's own fill, and now use `--panel-fg` mixed toward the accent — correct in both polarities by construction, and at least 6.58:1 for every alert kind across all four shipped themes.
