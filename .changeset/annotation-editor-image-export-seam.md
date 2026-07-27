---
'triiiceratops': patch
'@triiiceratops/plugin-annotation-editor': patch
---

Extend the `triiiceratops/image-export` seam with the canvas ↔ image coordinate-space helpers (`canvasPointToImagePoint`, `imagePointToCanvasPoint`, `transformAnnotationToCanvasSpace`, `transformAnnotationToImageSpace`, and the `CanvasImageSpaceDimensions` type). The annotation-editor plugin now consumes these plus `resolveCanvasImage` and `getCanvasId` from the shared seam instead of carrying byte-identical copies of the core modules.
