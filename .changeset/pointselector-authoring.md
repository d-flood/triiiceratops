---
'triiiceratops': minor
---

Annotation editor: the point tool now creates a true IIIF `PointSelector` annotation at the exact click location. The stored target is `{ type: 'SpecificResource', source: <canvas>, selector: { type: 'PointSelector', x, y } }` with integer canvas-pixel coordinates, produced directly at authoring time — no synthetic screen-pixel fragment rectangle, no zoom-dependent geometry, and no `point-` id heuristic. Points now go through the same create pipeline as drawn shapes (draft preparation, attribution/motivation stamping, and display sync), so a manually placed point carries `creator`, `created`, and `motivation` like any other annotation.

Point detection is now based on the selector type (`PointSelector`, including `selector.item`-wrapped selectors) rather than the annotation id. A read-compat path still resolves legacy fragment-center point data on read; new writes are always `PointSelector`.
