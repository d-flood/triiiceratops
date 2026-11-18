---
'triiiceratops': minor
---

Add `captureViewTarget`, `serializeContentState`, and `viewerState.subscribeSettled()` so a host can write the current view out as a content state once it comes to rest, without throttling. Script-tag pages get the same helpers on `Triiiceratops.contentState`.
