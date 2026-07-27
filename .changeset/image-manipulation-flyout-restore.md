---
'@triiiceratops/plugin-image-manipulation': minor
---

Migrate the image-manipulation plugin onto the core-owned-chrome path and restore its Flyout to `main`'s design. The plugin sets the transitional `__coreChrome` marker and `dismiss: 'explicit'`, deletes its self-rendered toggle button and `position: absolute` positioning, and renders content-only into the core-provided anchored container — core now renders the toolbar button from `meta.icon` and owns open/close, anchoring, and placement. The Flyout is again a boxless set of three vertical sliders (a themed range rotated −90°) floating over the canvas above a frosted glass base with icon + percentage labels and tooltip-wrapped invert/grayscale/reset actions, using the current `--tri-` theme tokens.

Filter state now lives in an Activation-scoped controller created in `view.mount` (per viewer, above the mounted component): the last slider positions survive close→reopen, closing the Flyout leaves the adjustment visible (no reset on close), and filters reset to default on canvas change and on deactivation whether the Flyout is open or closed. Filters are written to the raw OSD canvas via the OSD pass-through, gated on OSD readiness.
