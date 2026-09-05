---
'triiiceratops': patch
---

A static level-0 tile tree renders even when it spells its whole-image
derivative the other legal way. The base level of such a pyramid is one tile
covering the whole image, and the trees in the wild disagree about what to name
that file: `vips dzsave --layout iiif3` — and so every page `mkiiif` generates —
writes only `full/{tw},{th}`, while CSNTM is split against itself, its 𝔓3 tree
answering both spellings and its 𝔓40 tree only the explicit region
`0,0,{w},{h}/{tw},{th}`.

The whole-image request is now spelled with the canonical `full` region, which
Image API 3.0 §4.8 names as canonical for exactly this reason — a static file
tree "will have only a single URI at which the content is available" — and which
every OpenSeadragon-based viewer already sends. The explicit region is carried as
the tile's fallback, scoped to the service, so one 404 settles it for every
whole-image request that tree receives. A `vips`-generated tree previously
painted nothing at all: `tiles` alone is enough to derive its levels, but its
base level 404'd and the finer levels never covered the gap.

A content state delivered as a bare manifest URI no longer refetches the
manifest under its declared `id`. A Manifest served at one URL and declaring
another is legal and common — `mkiiif` writes `manifest.json` beside an
`index.html` and gives the Manifest the directory's URI — and the second fetch
returned that HTML page and failed to parse. The document already in hand is
handed to the manifest load instead.
