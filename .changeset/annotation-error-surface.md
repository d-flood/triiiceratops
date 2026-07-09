---
'triiiceratops': minor
---

Annotation editor: adapter failures are no longer invisible. A failed load/create/update/delete/hydrate now rolls back the plugin's optimistic cache and display changes, re-signals the open selection so the panel reverts to the last-saved state, and is surfaced to the host. New optional `onPersistenceError` config receives a structured error (`op`, `annotationId`, `manifestId`, `canvasId`, `cause`) plus a `retry()` handle that re-runs the exact failed operation. Without a handler the plugin logs the failure and shows a dismissible, localized error line in the panel. The per-id save queue no longer deadlocks on a rejected save.
