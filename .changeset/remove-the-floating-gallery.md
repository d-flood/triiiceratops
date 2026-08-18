---
'triiiceratops': minor
---

Remove the floating thumbnail gallery. The gallery now always occupies one of the four docked positions (`top`, `bottom`, `left`, `right`), which are unchanged; the mouse-only drag-to-dock gesture, the drag grip and header, the resize handle, and the four dock drop zones are gone with it.

Clean break on the retired config surface (pre-1.0, no deprecation shim): `gallery.dockPosition` no longer accepts `'none'`, and `gallery.draggable`, `gallery.width`, `gallery.height`, `gallery.x`, and `gallery.y` are removed. `ViewerState` drops `galleryPosition`, `gallerySize`, `setGalleryPosition()`, `setGallerySize()`, `isGalleryDragging`, `galleryDragOffset`, `dragOverSide`, and `galleryCenterPanelRect`; `ViewerStateSnapshot` drops `galleryPosition` and `gallerySize`.
