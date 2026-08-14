---
'@triiiceratops/plugin-av': minor
---

`@triiiceratops/plugin-av` now publishes **AVState**, so playback is externally commandable.

A host reaches it the way it reaches every other plugin capability — through the viewer, never by importing a control handle: `viewerState.getPluginState('av')`, or the typed accessor `getAVState(viewerState)` this package exports beside the `AVState` type. The surface is five commands (`play`, `pause`, `seek`, `setMuted`, `setVolume`), four observable facts (`paused`, `duration`, `buffering`, `activeMediaCanvasId`) delivered on the batched, payload-free `subscribe`, and a query-only `currentTime` read on the finer `subscribeFrame` cadence — the cadence a scrubber follows. Every member is classified, and the SDK conformance kit checks the classification.

All times are canvas time: `duration` is the canvas's duration and `seek` takes a canvas-time position, clamped to `[0, duration]`. Commands address the **current canvas's** media; multi-target addressing (`seek(canvasId, t)`) is a compatible future extension, not part of this release.

Failure is state, not an exception. A `play()` the browser's autoplay policy refuses leaves `paused` true and throws nothing at the host. A command issued while the current canvas plays no media this plugin claimed is refused on the host's structured `pluginerror` channel with the `command` phase and a retry, rather than silently doing nothing. The publication lives exactly as long as its activation, so `getAVState` answers `null` for a viewer where the plugin is absent, failed, or retrying.

The plugin's own interim panel now drives playback through the same object, so its UI cannot drift from the contract hosts use.
