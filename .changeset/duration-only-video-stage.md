---
'@triiiceratops/plugin-av': patch
---

Decide the stage layout from the body, not from the canvas's dimensions — the Cookbook's `0015-start` rendered no picture at all.

Which layout a claimed canvas gets was read off `width`/`height`: a canvas that declared both was a video stage, and one that declared neither was an audio stage whose opaque timeline lane fills the rect. But a duration-only canvas can paint a moving picture. `0015-start` — a IIIF Cookbook recipe, vendored verbatim — declares only `duration` and paints a `Video`, so its `<video>` was built, parked outside the visual lane and left behind a full-rect audio timeline. The reader saw a blank rect, sized from core's unsized-canvas placeholder box, and no video.

The scan now reports `paintsPicture` per source and the layout is chosen from the attached one. The two questions a body answers are kept apart, which is what `0014-accompanyingcanvas` needs: it types its body `Sound` and formats it `video/mp4`, so a `<video>` is the only element that will play it while the picture in the rect stays the accompanying canvas core paints behind it. `kind` follows the stated media type first; `paintsPicture` follows the IIIF type first. The canvas's own dimensions answer neither.

`AvSource` gains the `readonly paintsPicture: boolean` field. The plugin's IIFE grows from 15,023 to 15,039 bytes gzip, inside its ceiling.
