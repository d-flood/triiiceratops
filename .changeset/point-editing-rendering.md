---
'triiiceratops': minor
---

Annotation editor: points now render and edit consistently as first-class IIIF points. A new `pointStyle` config (`{ radius?, fill?, stroke?, strokeWidth? }`, radius in screen pixels) is honoured by both the read-only overlay and the editor so a point looks the same selected or not, at any zoom. The point editing marker is sized in screen pixels (constant visual size regardless of image resolution/zoom), and editing a point without moving it now round-trips bit-identically instead of drifting through the fragment-rect centre. Per-point styling uses Annotorious v3's supported `style` function, replacing the dead v2 `formatter`. `pointStyle` is also available on the viewer config for the read-only overlay.
