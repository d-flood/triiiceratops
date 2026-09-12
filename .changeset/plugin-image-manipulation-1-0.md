---
'@triiiceratops/plugin-image-manipulation': major
---

`@triiiceratops/plugin-image-manipulation` 1.0.

Migrated onto core's first-party image surface: adjustments are applied through
`ViewerState.setImageAdjustments` and cleared through `resetImageAdjustments`,
rather than through OpenSeadragon. With OpenSeadragon gone from the viewer the
`osd@5` capability goes too — the plugin declares no `requiredCapabilities` and
states compatibility with a `coreRange` floor alone.
