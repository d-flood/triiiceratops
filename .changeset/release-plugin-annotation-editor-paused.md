---
'@triiiceratops/plugin-annotation-editor': minor
---

**Annotation editing is unavailable in this release, and this package is not published.** It is paused, not deleted, and returns with the phase-2 drawing layer. Its editing surface is `@annotorious/openseadragon`, whose integration is constructed from the raw OpenSeadragon viewer and drives it directly, and that object no longer exists: the renderer is first-party now and `osd@5` is retired. The package therefore keeps declaring `osd@5` on purpose, so registering it against this core fails activation with a structured `PluginCompatibilityError` that says why, rather than installing a toolbar button that does nothing. Recorded so the in-repo version stays on the `1.0.0-rc` line it was published from; `1.0.0-rc.7` remains the newest version anyone can install, and no version recorded while the pause holds reaches npm.
