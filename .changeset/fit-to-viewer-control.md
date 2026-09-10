---
'triiiceratops': minor
---

The control bar gets a fit-to-viewer button, to the right of the zoom pair, and `ViewerState.fitView()` behind it. It re-frames what the reader is looking at — the laid-out world, or in `continuous` mode the canvas their viewport is over — which is what the `0`/`Home` key has always done and what the canvas surface's accessible name has always advertised. Reaching for the existing `fitCanvas()` here would have been wrong: naming a canvas is a request to TRAVEL to it, so after a scroll in `continuous` mode it returns the reader to a folio they left behind, and in `paged` mode it fits one page of a two-page spread. Refitting is the opposite request, so it names nothing. The parity rule puts the same command on `ViewerState` that the chrome's own button uses.
