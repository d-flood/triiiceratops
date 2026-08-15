---
'triiiceratops': minor
---

**Idle chrome**: over a claimed canvas the control bar gets out of the way.

While transport chrome is registered, the whole bar — the playback controls and the viewer's own navigation together — fades to `opacity: 0` and `pointer-events: none` after three seconds of untouched playback, and returns on a pointer move anywhere over the viewer, a key press, focus arriving, a tap, or a pause. This is what keeps chrome off the two things a reader of a recording is actually reading: the caption cues a `<video>` paints at the bottom of its frame, and the timeline lane, which on a sound recording with no accompanying image is the whole rect. It is also what lets the bar stay an overlay at all. Not `visibility: hidden` and not `display: none` — the controls stay in the accessibility tree and stay focusable, so a reader who tabs into a hidden bar reveals it rather than finding nothing there.

**Two rules are absolute**, because a viewer that broke either would be worse than one that never hid anything: **it never hides while playback is paused**, and **it never hides while keyboard focus is inside it**. A reader who stopped is looking at the viewer rather than through it, and focus must never land on something invisible. Beyond those, chrome a reader is using is not idle: a pointer resting on the bar pins it, and so does an open popover the bar owns — the track list, the canvas-info popover, and, under `controls: 'unified'`, a flyout of the toolbar rendered inside it.

**Scope is the registration.** Idle-hiding is active only while transport chrome is registered, and registration is manifest-scoped, so a manifest of page images behaves exactly as it does today: no timer, no listeners, nothing to observe. Within a manifest that does have recordings the bar idle-hides on its image pages too, because chrome that changed its behaviour page by page would be a worse thing to learn than one that behaves consistently for the work being read.

Reduced motion removes the fade, not the behaviour — the preference asks for animation to stop, not for the chrome to stop getting out of the way — and it is honoured through core's one watched source rather than a second reading of `matchMedia`.

The delay is public as `IDLE_CHROME_DELAY_MS`, alongside `canIdleHide`, the predicate that decides it: one exported rule, so a host reading the behaviour and the viewer applying it cannot drift.
