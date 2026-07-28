---
'triiiceratops': minor
---

Add an expandable thumbnail gallery — a full-column grid of every canvas, in the spirit of Mirador's gallery view. A caret centered on the gallery's inner edge expands the docked strip/rail to fill the viewer's center column as a thumbnail grid (a floating gallery gets a maximize button instead); the caret always points the way the gallery will travel. Side panels and the docked toolbar rail stay visible and usable, and OpenSeadragon keeps its size underneath, so collapsing never re-fits the image. Clicking a thumbnail selects that canvas and collapses back to it; `Escape` collapses without closing the gallery.

New state on `ViewerState`: `galleryExpanded` (command state, via `setGalleryExpanded()` / `toggleGalleryExpanded()`, and reported in `ViewerStateSnapshot`); expanding implies opening the gallery, and closing the gallery clears it. Expanding leaves `dockSide` untouched, so collapsing restores the strip, rail, or floating window exactly where it was. New config: `gallery.expanded` to boot straight into the grid, and `gallery.thumbnailSize` (default 160) for the expanded grid's cell width — independent of `gallery.fixedHeight`, which keeps sizing the docked strip.
