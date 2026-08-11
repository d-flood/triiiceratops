---
'triiiceratops': patch
---

In `continuous` viewing mode, canvas navigation now **eases to the target folio
instead of snapping to it**. The folio is already laid out beside the one on
screen, so choosing it from the canvas navigator is a request to travel there —
the animated case ADR 0015 has always specified for canvas navigation
(`ANIMATION_TIME_CONSTANT`), which the renderer's scene effect was not asking
for. Reduced motion still arrives instantly, and the folios passed over request
no thumbnails or `info.json`s on the way, because an animation clears the
view-stable gate.
