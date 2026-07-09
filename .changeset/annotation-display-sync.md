---
'triiiceratops': minor
---

Annotation editor: the plugin now owns annotation display sync — after every successful load/create/update/delete it injects annotations into the viewer's read-only overlay, and clears them on teardown. Storage adapters are now pure storage (`load`/`hydrate`/`create`/`update`/`delete`) and no longer need to touch `manifestsState`. `LocalStorageAdapter` was slimmed down to the reference minimal adapter accordingly.

Back-compat: custom adapters that still inject into `manifestsState` manually keep working — the plugin overwrites the same canvas with identical data (harmless). You can safely remove that injection code from your adapter.
