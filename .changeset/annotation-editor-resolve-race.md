---
'triiiceratops': patch
---

Annotation editor: fixed a stale-cache bug when resolving a skeleton annotation for editing. `AnnotationStore.resolve()` inlined its own hydrate fetch without the load-race guard the rest of the store uses (F14), so a canvas change while the hydrate was in flight could write the previous canvas's annotation into the new canvas's cache. Resolve now routes through `hydrate()`, which discards a hydrate whose canvas changed underneath it and reports adapter failures through the normal error surface. No API change.
