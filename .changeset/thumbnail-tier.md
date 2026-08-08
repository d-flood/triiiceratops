---
'triiiceratops': minor
---

Continuous mode now shows real pages rather than grey boxes.

- **A canvas too small on screen for a tile pyramid holds one small image**, so
  scrolling a long manuscript shows page images instead of a river of empty
  rectangles. Which image is resolved by a ladder, first match wins: the
  Canvas's own declared `thumbnail` (a fixed URL, used as-is — it works for a
  level0 service and costs no discovery); a URL constructed from the manifest's
  image-service id when the declared profile is level 1 or 2, so an ordinary
  manifest fills its thumbnails with **no `info.json` requests at all**; then
  the service's own advertised sizes or scale-factor whole images, once its
  `info.json` has been fetched.
- **Requested sizes are quantized to a ladder** — 32/64/128/256/512 device
  pixels, rounded up — rather than computed from the exact projection. A
  continuous zoom therefore reuses a handful of URLs and hits the HTTP cache,
  where an exact size would mint a fresh URL per frame per canvas.
- **Nothing is requested while the view is moving.** No thumbnail and no
  `info.json` request is issued during a gesture, a spring settle, flick
  momentum, or a held arrow key — only once motion stops. A flick passes over
  hundreds of folios that are never dwelt on, and this alone removes most of
  what would have been asked for on their behalf. Tiles are deliberately not
  gated: a canvas large enough for a pyramid is one the reader is looking at.
  A thumbnail already decoded keeps painting through the gesture, at whichever
  rung it was fetched at, so a pinch across a size boundary re-sharpens when it
  ends rather than blanking while it runs.
- **`info.json` requests are capped as well as gated.** At most six are
  outstanding at once, however many canvases want one — otherwise zooming all
  the way out on a level0 manifest starts one request per canvas in the
  residency window the moment the view settles.
- **Thumbnails share the tiles' scheduler**, so the concurrency cap is global
  rather than per-kind, the queue is ordered by distance from the viewport
  centre (the page being looked at arrives first), a thumbnail superseded by a
  scroll is aborted, and thumbnail pixels are counted by the same decoded-byte
  accounting and released by the same distance rule.
- **A canvas with no usable thumbnail renders as a plain box, permanently.** It
  is reported once for developers and never retried: a retry loop across
  hundreds of canvases against one badly-behaved server is the worst kind of
  bug to diagnose remotely. That means a level0 service whose cheapest image is
  over the decoded-pixel ceiling — a master with no derivatives — rather than
  any level0 service: an ordinary derivative set is used exactly as published.
