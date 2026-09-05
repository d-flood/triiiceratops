---
'triiiceratops': minor
---

Add an expandable thumbnail gallery — a full-column grid of every canvas, in the spirit of Mirador's gallery view. A small caret centered on the gallery's canvas-facing edge expands the docked strip/rail to fill the viewer's center column, animating open as a drawer sliding out of its dock edge — a bottom-docked strip grows upward. The caret keeps its edge across the transition, so it never jumps out from under the cursor; only its glyph flips to point the way the gallery will travel next. Side panels and the docked toolbar rail stay visible and usable, and OpenSeadragon keeps its size underneath, so collapsing never re-fits the image. Clicking a thumbnail selects that canvas and collapses back to it; `Escape` collapses without closing the gallery.

The expanded overlay is the docked gallery's own density at viewer size — the same `gallery.fixedHeight` cell floor, padding, and gap — rather than a second layout with its own, so the two cannot drift apart.

New state on `ViewerState`: `galleryExpanded` (command state, via `setGalleryExpanded()` / `toggleGalleryExpanded()`, and reported in `ViewerStateSnapshot`); expanding implies opening the gallery, and closing the gallery clears it. Expanding leaves `dockSide` untouched, so collapsing restores the strip or rail exactly where it was. New config: `gallery.expanded` to boot straight into the grid.
