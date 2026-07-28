---
'triiiceratops': minor
'@triiiceratops/plugin-sdk': minor
---

Fix a plugin SDK regression: an SDK plugin could not tell whether its own panel or flyout was open. A legacy `PluginDef` learned this from its Svelte component's mount/destroy lifecycle, but core mounts an SDK plugin once and re-parents its content element in and out of the open surface (so Activation state survives close→reopen), and nothing replaced the lost signal. Three things blocked it: `ViewerState` had no public reader for plugin open state, the `pluginUiState` member was classified `internal` in the state inventory and therefore excluded from the framework-neutral subscription watcher, and `togglePluginOpen` — the toolbar-button path, i.e. how users actually open and close a plugin — notified nobody.

New `PluginContext.surface` (`PluginSurface`) is the plugin's own chrome: `isOpen` and `target` are live getters over viewer state, so they compose with `context.selectors` like any other viewer state, and `open()`/`close()`/`toggle()` drive the same commands the toolbar does. It closes over the plugin's chrome id (also exposed as `surface.id`, the `config.plugins` key), so a plugin never re-derives it. `surface.close()` also restores the self-close affordance the legacy `close` prop provided. Open-state changes now notify from every write source alike: the toolbar button, flyout light-dismiss, `config.plugins[uiId].open`, and `ViewerState.setPluginOpen`.

Supporting public API: `ViewerState.isPluginOpen(id)` (the read half of `setPluginOpen`), `ViewerState.togglePluginOpen(id)`, `ViewerState.ensurePluginUiState(id, target?, position?)` (host-facing chrome seeding), and `createPluginSurface`, exported from both `triiiceratops` and `triiiceratops/testing`. `setPluginOpen` now no-ops without notifying when the plugin is already in the requested state, matching `setPluginTarget`/`setPluginPosition`.

The SDK test kit's `createTestViewerContext` exposes the REAL surface over the real state (new `uiId`, `target`, and `open` options; `surface.isOpen` defaults to `true` so a surface-gated plugin is exercised in its active state). A chrome-less host — a bare `runActivation` into a container the caller placed — gets an always-open stub with no-op movers, since nothing could be hiding the plugin's UI.
