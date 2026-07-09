---
'triiiceratops': patch
---

Annotation editor: fixed a data-loss bug and hardened the suite/docs. Saving a body on a freshly created (still-open) annotation persisted the update and then immediately deleted the annotation — the editor-teardown `clearAnnotations()` delete echo collided with the body-save `updateAnnotation` echo on a single-entry suppression set, so the delete leaked to the adapter. Echo suppression is now counted per id, so both concurrent echoes are matched and neither reaches storage. Added an end-to-end manager+store lifecycle integration suite and a Playwright authoring flow (create point → body → persist → reload → delete). No API change.

Docs: the Annotation Editor guide now covers IIIF point behavior (`PointSelector`, integer canvas px, `pointStyle`), a full configuration reference table, Svelte and framework-agnostic custom body-editor recipes, a point-only tagging walkthrough, and migration notes for the v1 adapter API (display sync moved into the plugin, `__fullBodyLoaded` no longer round-trips, persistence-aware undo/redo, deprecated window events).
