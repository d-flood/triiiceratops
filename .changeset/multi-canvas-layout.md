---
'triiiceratops': minor
---

Multi-canvas layout: facing-page spreads in the Canvas2D renderer, a v2
`viewingHint` fix, and one layout bug.

- **IIIF v2 `viewingHint` on a Canvas is now read.** `non-paged` and
  `facing-pages` are the v3 `behavior` values the viewer already honoured; their
  v2 spelling had no reader, so a v2 manifest declaring a single-page plate had
  it paired into a spread with its neighbour — and every spread after it was off
  by one. `behavior` still wins where a document carries both, unless it is
  empty: `"behavior": []` is what a v2→v3 converter leaves behind on every
  canvas, and the `viewingHint` beside it is then the only hint the document
  carries.
- **Layout advances by each canvas's own extent.** With normalization off
  (`preserveCanvasScale`, or a sibling with no dimensions) the cumulative offset
  advanced a fixed one world unit per canvas regardless of how wide that canvas
  was, so anything wider than one unit overlapped its neighbour. The extent it
  advances by is the **Canvas box**, not the painted extent, so a canvas whose
  painting annotation targets a sub-region still occupies a whole page: its
  positions are unchanged, and every caller shipping today keeps the layout it
  has.
- The renderer now shows a facing-page spread rather than the current canvas
  alone, positioned by that same shared layout function in canvas space. A
  Canvas that
  declares no `width`/`height` is laid out from the median of its siblings —
  or, with no sized sibling to take a median from, from a placeholder box —
  and repositioned if its image service later reports real ones, rather than
  being dropped. A dropped canvas is never laid out, so it is never asked for
  the metadata that would size it: it would be blank permanently rather than
  briefly. Whichever axis the manifest did state is kept even when the other is
  missing. Never blocked on a fetch.
- The inter-canvas gap can now be given to the shared layout function as a
  **fraction** as well as an absolute length, resolved after normalization and
  on the axis layout has already chosen. It is what the canvas-space renderer
  passes, where an absolute default would be a sub-pixel hairline.
