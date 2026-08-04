---
'triiiceratops': patch
---

**Breaking:** `gallery.fixedHeight` is now `gallery.size`, and it means the gallery's own extent rather than a thumbnail's height: the strip's height when the gallery is docked to the top or bottom, and the rail's width when it is docked to the left or right. The default is `100` — a 62px-tall thumbnail in a bottom strip, and an 84px-wide one in a side rail. `ViewerState.galleryFixedHeight` is now `ViewerState.galleryExtent`, and the settings control is relabelled "Gallery Size" with a 90–340 range.
