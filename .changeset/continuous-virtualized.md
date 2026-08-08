---
'triiiceratops': minor
---

Continuous viewing mode now works on a manifest of arbitrary length.

- **Opening an 800-folio manuscript costs O(1) network requests**, not one
  `info.json` per canvas. The whole manifest is laid out — that is arithmetic
  over the manifest's own Canvas dimensions and costs nothing — but only the
  canvases near the viewport are allowed to hold anything. Everything else is
  **box tier**: no metadata request, no tiles, no texture, whatever its
  projected size. The gate has to be positional, because the residency tier is
  decided from projected size alone and at reading zoom every folio in an
  800-page manifest projects the same way.
- **The residency window is the viewport rect inflated by a factor, plus the ±1
  canvas beyond the page on screen** — so turning the page is instant. A rect
  rather than a canvas count, so a wide left-to-right world and a tall
  top-to-bottom one need no axis conditional. Membership is a pure function of
  where the viewport is, never of how the reader got there, so the resident set
  after scrolling to folio 400 is the same whether they went there directly or
  by way of folio 700.
- **A canvas leaving the pyramid tier releases everything it held, base level
  included.** "The base level is never evicted" is scoped to the pyramid tier;
  read across a whole manifest it would mean 800 resident base tiles.
- **Decoded tiles are now bounded by a byte budget**, 128 MB on desktop and
  48 MB on a phone. A tile dropped from the required set is not closed but moves
  to an **opportunistic cache**, an LRU keyed by recency, so returning to a page
  costs no request at all; the cache gives up its least recently dropped bytes
  to stay under the ceiling. In bytes rather than in tile count, because a
  count-based cache varies its footprint by more than an order of magnitude with
  a server-side tile-size choice the viewer does not control.
- **Zooming out now stops where pages become too small to read.** The floor is
  derived — the zoom at which the median canvas reaches the box threshold — so
  it scales with the manifest instead of being a tuned percentage of home zoom.
  The zoom ceiling and "fit" are correspondingly measured from the current
  canvas in continuous mode rather than from the whole world, which on a long
  manifest was a scale at which every page was one pixel across.
