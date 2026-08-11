---
'triiiceratops': patch
---

Fix IIIF `Choice` selection on tiled canvases: selecting anything but the first
alternative did nothing.

Both halves of the bug were the same mistake — a canvas id is not a stable name
for a picture, so a Choice switch resolves the same canvas to a different image
service, and anything keyed on the id alone answers for the previous
alternative. `imageRequests` already said so for whole decoded images, which is
why a Choice between two *static* images always worked; the tiled path did not.

- **Tile identity** now includes the service (`tilePyramid.tileKey`). Keyed on
  the canvas alone, every tile of the newly selected alternative was already
  "resident and required", so the scheduler issued no request at all and the
  first alternative stayed on screen forever.
- **`PlanWorldInput.knownMetadata`** is now keyed by **service id** rather than
  canvas id (`planScene.factsFor`), matching the service-keyed cache it is a view
  onto. Canvas-keyed, the new service's `info.json` was never asked for — the
  record already had a non-empty answer — and its pyramid was built from the
  previous alternative's dimensions, which is wrong for any Choice whose
  alternatives differ in resolution.
