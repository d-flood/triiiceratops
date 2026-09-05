---
search:
  exclude: true
---

# Continuous input is never animated; discrete and programmatic input always is

One rule governs every viewport motion. **Continuous input is direct**: a drag updates
the transform in the pointer-move handler, 1:1, with no smoothing; a pinch scales and
translates about the gesture midpoint the same way; releasing a drag or pinch throws
momentum computed from the recent pointer samples, decaying under friction and cancelled
instantly by the next pointer-down. **Discrete and programmatic input is animated**: the
wheel, double-click and double-tap, the toolbar zoom buttons, fit-bounds, fit-canvas, and
canvas navigation all approach their target as a frame-rate-independent exponential, with
zoom interpolated in log space so a step feels the same at every scale. Two sub-decisions
ride along: there is **no trackpad-versus-mouse detection** — all wheel input takes the
same short time constant, because the usual heuristics are unreliable and that branch is
a permanent source of hardware-specific bugs — and input is **Pointer Events only**, one
path with no parallel mouse, touch, or legacy branches. Under
`prefers-reduced-motion: reduce` every animated case becomes instant and momentum is
disabled, which the previous renderer never honoured because its easing was JS-driven
while the only check in place observed CSS durations.

**This is the decision most likely to be "fixed" back, and it must not be.** The
reasoning that leads there is entirely plausible: panning is the most-used gesture,
smoothing makes motion look nicer everywhere else, so the pan target should be sprung too
— and it is one line to try. Do not. Springing the pan target is *precisely* what made
the previous renderer feel laggy: with a spring in the path, the image under the finger is
always behind the finger by the spring's time constant, so the reader is dragging a
rubber band rather than moving a page, and every attempt to fix it by stiffening the
spring converges on removing it. The asymmetry is the point — a spring is a *good* answer
when the input is a single discrete event with no ongoing signal to track (a click has no
"where is your finger now"), and a *wrong* answer when the input already supplies a
position every few milliseconds. If pan smoothing is proposed again, the thing to
demonstrate first is a dragged image that stays under the pointer; nothing else settles
it. What may legitimately be tuned is the animated side: `config.renderer` exposes
`animationTimeConstant`, `zoomPerClick`, and `zoomPerWheelNotch` for exactly that.

`zoomPerWheelNotch` is worth a note, because it is where the no-device-detection
sub-decision gets tested in practice. The complaint that leads to a trackpad branch is
almost always "the wheel zooms too fast" — and a knob expressed *per notch*, converted
once into a rate *per pixel*, answers it without one: the two devices agree by
construction, since a trackpad covering a notch's worth of distance in ten small deltas
lands on the same scale as a wheel that emits the notch whole. Tuning the number is the
supported response to the speed feeling wrong. Splitting it in two is not.
