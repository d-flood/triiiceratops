---
'triiiceratops': patch
---

Wait for container resizing to stop before firing `subscribeSettled()` (and `write-content-state-to-url`), and never report `viewportBounds` or a settled view while the viewer surface has zero size. A viewer hidden and shown again keeps its view instead of refitting.
