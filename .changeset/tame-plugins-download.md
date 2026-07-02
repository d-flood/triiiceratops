---
'triiiceratops': minor
---

Add an `image-download` plugin for downloading the current canvas (or current multi-canvas view) as a raster image, with modes for composite canvases, a single image, and the current OSD view, plus IIIF `level0`-aware resolution options. Also fix `pdf-export` silently dropping every image after the first on a composite canvas (a canvas painted with more than one image) — it now composites all of them onto the PDF page.

`pdf-export`'s toolbar/panel icon changed from `DownloadSimple` to `FilePdf` so it's visually distinct from the new `image-download` plugin's icon; the `DownloadSimple` named export from `triiiceratops/plugins/pdf-export` is replaced by `FilePdf`.
