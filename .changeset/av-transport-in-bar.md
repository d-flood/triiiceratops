---
'@triiiceratops/plugin-av': minor
'triiiceratops': patch
---

Move the AV transport into the viewer's control bar.

The plugin no longer builds playback chrome. It assembles the same view model it always assembled and registers it through core's `transport-chrome` seam; core renders the controls as a group of its own control bar. Everything the plugin carried in order to be anchored to a projected canvas rect is gone: the transport component and its stylesheet, the anchor box and its per-frame screen-pixel geometry, the minimum-projected-width constant and the predicate behind it, and the plugin's private copies of the shared `Button` and `Range` primitives.

**The two reader-facing bugs this fixes.** The previous/next canvas buttons, the zoom controls and the canvas index stay visible and clickable while a recording is open — there is no longer a second piece of chrome over the canvas to collide with them. And the playback controls now appear in the same place at every zoom, at a constant size, all the way into a waveform: a reader zoomed deep into a passage keeps the full controls instead of losing them to a width test.

Everything a reader could do before, they can still do, through the same commands: playback is still driven through the published state a host reaches via viewer state, so application chrome keeps working unchanged, and tapping the picture and tapping the timeline lane behave exactly as they did. The scrubber still shows buffered ranges and the waveform strip; the captions control and its language list still work, and the list now opens in whichever direction keeps it on screen.

**The play-state glyph stays, with a narrowed trigger.** It marks the claimed canvases the bar is *not* driving, so a reader with several recordings laid out at once can still tell which are playing. Its "the transport does not fit" clause is gone with the width test. This narrows `plugin-av` user story 26; user story 9 ("anchored at constant screen size") is superseded outright, both annotated in that spec rather than deleted.

Registration is manifest-scoped: the plugin registers while the current manifest has at least one canvas it has claimed and releases when it has none, so a manifest of page images registers nothing at all. Within a manifest, navigating to an unclaimed canvas flips the view's `present` flag rather than churning the registration. `transport-chrome` joins the plugin's `requiredCapabilities`, so it fails closed with a named diagnostic on a core too old to render the controls rather than staging a recording a reader cannot play.

The plugin's IIFE drops from 21,402 to 17,140 bytes gzip, and its ceiling in `check-shared-runtime.mjs` is ratcheted to match. Deleting a whole component drops most of what the shared Svelte runtime was carrying: `SHARED_SVELTE_RUNTIME` and the plugin's own `REQUIRED_SVELTE_INTERNALS` are re-derived from the built artifact and fall from 30 helpers to 11, which core shrinks with. Core plus the registered AV plugin now measures 139,506 gzip against the 141,467 competitive budget — 1,961 bytes of headroom where there were 114, and 1,847 below the 141,353 the pair measured before this epic began.
