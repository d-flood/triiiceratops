---
'triiiceratops': patch
---

A static level-0 tile tree renders even when it spells its whole-image
derivative the other legal way. Two generators in the wild disagree about that
one URL — CSNTM's writes the explicit region `0,0,{w},{h}/{tw},{th}` and `vips
dzsave --layout iiif3` writes the canonical `full/{tw},{th}` — and the base
level of such a pyramid is exactly that request. The tile now carries the second
spelling as its fallback, scoped to the service, so one 404 settles it for every
whole-image request that tree receives. A `vips`-generated tree previously
painted nothing at all: `tiles` alone is enough to derive its levels, but its
base level 404'd and the finer levels never covered the gap.

A content state delivered as a bare manifest URI no longer refetches the
manifest under its declared `id`. A Manifest served at one URL and declaring
another is legal and common — `mkiiif` writes `manifest.json` beside an
`index.html` and gives the Manifest the directory's URI — and the second fetch
returned that HTML page and failed to parse. The document already in hand is
handed to the manifest load instead.
