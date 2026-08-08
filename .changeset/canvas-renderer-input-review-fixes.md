---
'triiiceratops': patch
---

fix the development-only Canvas2D renderer's pointer input model (no effect on the shipping OpenSeadragon path)

A gesture the arbiter never granted now has **no outcome at all**. `arbitrate`
was the single ownership decision for pan and pinch only; a release still
decided tap, double tap, and flick on its own, so a held phase-2 input claim
would have suppressed panning while a double tap still zoomed 2× and a flick
still glided. The ownership decision is now carried forward to the discrete
outcomes, which is what the claim's definition — suppressing pan **and** zoom —
requires.

Flick velocity is measured against `PointerEvent.timeStamp` rather than the
`performance.now()` of the handler that received the event. Both are on the same
time origin, so nothing is mixed; the difference is that a janked main thread
delivering ninety milliseconds of travel in one twenty-millisecond burst no
longer reads as several times the real speed.

Wheel notches accumulate against the animation's **target** rather than the
part-eased scale, so ten fast notches land exactly where ten slow ones do.
(The symptom of the old behaviour — "the trackpad zooms less than the mouse
wheel" — is exactly what tempts a device-detection branch. There is still none.)

Pan and zoom clamping no longer builds a full scene plan per pointer event: the
world bounds and the derived zoom floor come from a cheap planner entry point,
so tile-set enumeration stays where it belongs, once per frame.

A lost pointer capture, or a mouse move arriving with no button held, now ends
the gesture instead of leaving a pointer stuck down — which previously panned on
hover and made the next press read as a pinch.

A press no longer freezes an in-flight wheel or double-tap zoom part-way: single
click is unbound, so it is the first gesture that actually moves the viewport
that truncates an animation. Momentum is still cancelled instantly by any
pointer-down.

A window resize re-clamps the centre, which the new viewport can otherwise
leave illegal.
