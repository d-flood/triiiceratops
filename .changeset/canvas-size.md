---
'triiiceratops': minor
---

Report a canvas's own extent, so a plugin can place DOM over a canvas the manifest gave no dimensions.

`viewerState.canvasSize(canvasId?)` answers the extent of a canvas's coordinate space — what `(0, 0)` to `(width, height)` means for that canvas — for the current canvas unless one is named, and `null` when the mounted renderer does not lay that canvas out. It is usually the manifest's declared `width`/`height`, and the reason it is asked rather than read is the case where there is none: a Canvas need not declare any — a duration-only audio canvas does not — and is laid out anyway, from its siblings' median. Its layout rect is then the only statement of its extent anyone has, and canvas space becomes that rect.

That is the answer `canvasToScreen` and `screenToCanvas` already divide by, so a caller projecting a box over such a canvas now gets the rect the viewer is actually drawing instead of dimensions it invented and the coordinate helpers would then disagree with. Nothing about layout, navigation, or projection changes: this exposes the geometry ladder's existing answer rather than adding one.

New public type `CanvasSize`, and a matching `RendererPort.getCanvasSize` — a renderer port implemented outside this package must answer it.
