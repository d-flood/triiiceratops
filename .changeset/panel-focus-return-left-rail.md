---
'triiiceratops': patch
---

**Closing a docked panel returns keyboard focus to the toolbar toggle that
opened it, on the left as well as the right — and a plugin panel is now named.**

This resolves the limitation recorded in the previous release's plugin-panel
close-button changeset: a **left**-docked panel under a left toolbar rail (the
default for a plugin panel, and the demo's toolbar configuration) dropped focus
to `<body>` on open, so Escape did nothing and closing returned focus nowhere.
Nothing about it was plugin-specific — a core panel configured
`position: 'left'` behaved identically — and the fix is not either.

**Why it happened.** Opening a panel on the toolbar's own side docks the toolbar
as a screen-edge rail: the floating toolbar unmounts and a docked one mounts in
the same flush, so the toggle the reader activated is a node in a destroyed
subtree by the time the panel is on screen.

**The fix — re-capture the invoker by identity** (candidate 1 in the ticket),
chosen over rendering one `<Toolbar>` whose docked-ness is a prop (candidate 2).
It is local and low-risk, and it preserves the `dockRailLeft` invariants by
construction: the atomic floating→rail hand-off is untouched, so there is still
never more than one toolbar, never zero, and the un-dock animation and
`…SidebarPresent` latch are exactly as they were.

- Every panel toggle in the toolbar now carries `data-panel-toggle="<panel id>"`
  — one convention for core and plugin toggles alike. A panel resolves its
  invoker through that attribute at dismiss time instead of holding the node it
  saw at mount, so a toolbar rebuilt in between is still found.
- When that hand-off destroyed the invoker, the panel takes focus itself on
  mount, so Escape reaches it without the reader tabbing in first. When the
  invoker survives (any right-docked panel), focus stays on it exactly as
  before, and a panel opened programmatically never steals focus.
- Focus also survives the *second* rebuild, when the rail hands back to the
  floating toolbar after the panel's column has finished sliding shut.

**Two accessibility gaps in the same chrome close with it:**

- A plugin's docked panel exposes a `dialog` role named by its header copy, so
  `getByRole('dialog', { name })` addresses it the way a core panel is
  addressed, and two stacked panels are no longer two identical "Close" buttons.
  Core supplies this where the panel item is built; no plugin opts in.
- A plugin's toolbar button that toggles a panel carries `aria-pressed`,
  matching the core panel toggles, so a reader returning to it hears its open
  state. A plugin button that only performs an action is left alone — it is not
  a toggle and has no pressed state to announce.

No new plugin-facing API, no state members, and no change to the default plugin
panel position.
