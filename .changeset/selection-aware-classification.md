---
'triiiceratops': minor
---

Classify a canvas over the alternative the reader actually selected.

`isUnsupportedCanvasFor(selection, canvas)` is new public API from `triiiceratops` and `triiiceratops/image-export`, alongside the `ChoiceSelection` type it takes. It pairs the painting-body classification rule with the Choice-selection lookup it has to be asked with, resolving the canvas id itself: `isUnsupportedCanvasFor(viewerState, canvas)`, or with a bare `getSelectedChoice` callback where that is what a caller holds. Every site in the viewer, the AV plugin, and both export plugins now goes through it, which is what stops one of them learning about selection while another does not — the drift that showed the image alternative in the thumbnail strip for a canvas the viewer was reporting as undisplayable. `isUnsupportedCanvas(canvas, selectedChoiceId)` remains available for a caller that already has the selected id in hand.

`getThumbnailSrc(canvas, size, selectedChoiceId)` takes the selection too. Its painting-annotation rungs now resolve the same alternative the classifier reads, so a mixed Choice resting on its video alternative yields no thumbnail URL rather than the image alternative's. A canvas's own declared `thumbnail` is unaffected: a poster frame is an image by declaration and is still shown.
