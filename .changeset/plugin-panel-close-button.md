---
'triiiceratops': minor
---

**A plugin's docked panel now has a close button — the same one every core panel
already had.**

`PluginUiConfig` now extends `ClosablePanelConfig`, so it inherits
`showCloseButton?: boolean` with the same documented default of `true` as
`search`, `annotations`, `information`, `structures`, and `collection`. A plugin
whose UI is docked left or right gets a close button in its panel header and
Escape-to-close while focus is inside the panel — both the shared
`PanelStackSection` chrome, reached by passing it a `close`. Closing sets the
plugin's open state to `false`, so `isPluginOpen` and a plugin's own
`surface.isOpen` read closed afterwards.

**Known limitation: focus return does not yet work for a left-docked panel under
a docked toolbar rail.** `PanelStackSection` returns focus to the toolbar toggle
that opened the panel (WCAG 2.4.3), and that works for a right-docked panel. But
when the panel is docked **left** while the toolbar is expanded on the left in
`split` controls, opening the panel docks the toolbar as a screen-edge rail,
which destroys and re-creates the toggle — so focus falls to `<body>` instead,
and a subsequent Escape (scoped to the panel) does nothing until the reader tabs
back in. This is pre-existing behaviour of the left rail, not new here: a core
panel forced `position: 'left'` behaves identically. It matters more for plugins
because a plugin panel defaults to the **left**, where core's panels default to
the right. Tracked as a follow-up in
`.tracker/plugin-overlay-layers/tickets/06-plugin-panel-focus-return.md`; the fix
is in shared panel/toolbar chrome and deliberately out of this change's scope.
Consumers who need focus return today can set
`config.plugins[uiId].position = 'right'`.

**This is a visible change for existing consumers.** A plugin panel that rendered
no close button before this release renders one after it. That is the intended
outcome — the parity rule says anything the viewer's own UI can do, a plugin can
do, and until now a reader could only dismiss a plugin panel by hunting down its
toolbar button again. A consumer who wants the previous appearance sets
`config.plugins[uiId].showCloseButton = false`, which suppresses the button and
the Escape path together — one flag, not two.

**Left/right docked panels only.** Bottom-position plugin panels render no header
at all, so they are unchanged; giving them a close affordance means designing a
header for a bottom panel, which is left as a follow-up. Overlay-position panels
are a bare layer over the image and correctly have no header. Flyouts keep their
own dismiss model (`dismiss: 'light' | 'explicit'` plus `surface.close()`) and are
untouched.

**Nothing in the plugin-facing surface changes.** `PluginSurface.close()` already
let a plugin close itself; this adds the *reader's* affordance beside it.
`definePlugin` and the SDK are unchanged.

**Element size.** Measured against the current `size-baseline.json` (already
re-recorded earlier in this release for the overlay-layer and viewport-inset work),
this change costs **+99 bytes raw / +38 gzip / −7 brotli** on the IIFE artifact and
**+138 / +30 / −46** on the ESM one — inside the 512-byte slack on every metric, so
`size:check` passes and the baseline is left alone.
