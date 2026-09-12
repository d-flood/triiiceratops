---
'@triiiceratops/plugin-pdf-export': major
---

`@triiiceratops/plugin-pdf-export` 1.0.

Migrated onto core's first-party image surface, reached through the
framework-neutral `triiiceratops/image-export` toolkit. With OpenSeadragon gone
from the viewer the `osd@5` capability goes too — the plugin declares no
`requiredCapabilities` and states compatibility with a `coreRange` floor alone.
An audiovisual canvas is recognised as unpaintable (`isUnsupportedCanvasFor`) and
left out of the document rather than pushed through the image pipeline.
