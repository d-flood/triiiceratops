---
'triiiceratops': patch
---

Multi-canvas layout: facing-page spreads in the Canvas2D renderer, a v2
`viewingHint` fix, and one layout bug.

- **IIIF v2 `viewingHint` on a Canvas is now read.** `non-paged` and
  `facing-pages` are the v3 `behavior` values the viewer already honoured; their
  v2 spelling had no reader, so a v2 manifest declaring a single-page plate had
  it paired into a spread with its neighbour — and every spread after it was off
  by one. `behavior` still wins where a document carries both.
- **Layout advances by each canvas's own extent.** With normalization off
  (`preserveCanvasScale`, or a sibling with no dimensions) the cumulative offset
  advanced a fixed one world unit per canvas regardless of how wide that canvas
  was, so anything wider than one unit overlapped its neighbour. Positions are
  unchanged for the normalized case and for any caller whose canvases really are
  one unit wide, which is every caller shipping today.
- The development-only Canvas2D renderer now shows a facing-page spread rather
  than the current canvas alone, positioned by that same shared layout function
  in canvas space. Continuous mode still shows one canvas; the whole manifest
  arrives with the virtualization that makes it affordable. A Canvas that
  declares no `width`/`height` is laid out from the median of its siblings and
  repositioned if its image service later reports real ones, rather than being
  dropped — it is never blocked on a fetch.
