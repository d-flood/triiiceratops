# @triiiceratops/plugin-sdk

## 1.0.0-rc.5

### Patch Changes

- b6bc43f: Fix SDK plugin chrome being labelled with the raw package name. A plugin's toolbar tooltip/aria-label and its docked-panel header rendered `@triiiceratops/plugin-pdf-export` instead of "PDF Export": core passed `SdkPluginMeta.name` — the package-qualified identity — straight through as display copy, and then resolved it against CORE's message catalog, where a plugin's own title key never lives.

    `definePlugin` gains an optional `title`. Core resolves it through the plugin's OWN `catalog` in the viewer's active locale (English fallback), so plugin titles stay translated and follow a `config.locale` change; a `title` with no matching catalog key renders verbatim, so a monolingual plugin can just write `title: 'My Plugin'`. All four first-party plugins now declare their existing catalog title keys, restoring their localized names (`PDF Export` / `PDF-Export`, `Download Image` / `Bild herunterladen`, `Image Adjustments` / `Bildanpassungen`, `Annotation Editor` / `Anmerkungs-Editor`). The image-manipulation flyout's toggle and dialog `aria-label` now also agree with the label announced inside it.

    Backwards compatible: a plugin with no `title` renders exactly what it rendered before — its `name` looked up in core's catalog, else `name` verbatim — and the legacy `PluginDef` path, where `name` IS documented display copy, is unchanged. Do not work around this by overriding `name`: it keys the plugin registry, namespaces the plugin's injected styles, and sets `data-plugin-name`.

- Updated dependencies [4eca8dc]
- Updated dependencies [b6bc43f]
    - triiiceratops@1.0.0-rc.29

## 1.0.0-rc.4

### Minor Changes

- 63fe1bb: Fix a plugin SDK regression: an SDK plugin could not tell whether its own panel or flyout was open. A legacy `PluginDef` learned this from its Svelte component's mount/destroy lifecycle, but core mounts an SDK plugin once and re-parents its content element in and out of the open surface (so Activation state survives close→reopen), and nothing replaced the lost signal. Three things blocked it: `ViewerState` had no public reader for plugin open state, the `pluginUiState` member was classified `internal` in the state inventory and therefore excluded from the framework-neutral subscription watcher, and `togglePluginOpen` — the toolbar-button path, i.e. how users actually open and close a plugin — notified nobody.

    New `PluginContext.surface` (`PluginSurface`) is the plugin's own chrome: `isOpen` and `target` are live getters over viewer state, so they compose with `context.selectors` like any other viewer state, and `open()`/`close()`/`toggle()` drive the same commands the toolbar does. It closes over the plugin's chrome id (also exposed as `surface.id`, the `config.plugins` key), so a plugin never re-derives it. `surface.close()` also restores the self-close affordance the legacy `close` prop provided. Open-state changes now notify from every write source alike: the toolbar button, flyout light-dismiss, `config.plugins[uiId].open`, and `ViewerState.setPluginOpen`.

    Supporting public API: `ViewerState.isPluginOpen(id)` (the read half of `setPluginOpen`), `ViewerState.togglePluginOpen(id)`, `ViewerState.ensurePluginUiState(id, target?, position?)` (host-facing chrome seeding), and `createPluginSurface`, exported from both `triiiceratops` and `triiiceratops/testing`. `setPluginOpen` now no-ops without notifying when the plugin is already in the requested state, matching `setPluginTarget`/`setPluginPosition`.

    The SDK test kit's `createTestViewerContext` exposes the REAL surface over the real state (new `uiId`, `target`, and `open` options; `surface.isOpen` defaults to `true` so a surface-gated plugin is exercised in its active state). A chrome-less host — a bare `runActivation` into a container the caller placed — gets an always-open stub with no-op movers, since nothing could be hiding the plugin's UI.

### Patch Changes

- Updated dependencies [809d6a6]
- Updated dependencies [63fe1bb]
    - triiiceratops@1.0.0-rc.28

## 1.0.0-rc.3

### Patch Changes

- d280560: Cut a fresh rc so the `latest` dist-tag moves off the broken `1.0.0-rc.1` (which
  shipped `triiiceratops: workspace:^` and crashes bare `npm install` with
  `EUNSUPPORTEDPROTOCOL`). The corrected `rc.2` is already published, but under npm
  OIDC trusted publishing a dist-tag can only be set at publish time — there is no
  post-publish `npm dist-tag` — so pointing `latest` at a clean version requires
  publishing a new version to `latest`. No source changed.
    - triiiceratops@1.0.0-rc.26

## 1.0.0-rc.2

### Patch Changes

- 8c58f9c: Republish to supersede `1.0.0-rc.1`, whose published tarball carried a
  `workspace:^` peer-dependency protocol on `triiiceratops` (a leftover from
  monorepo linking that was never rewritten to a real semver range). npm cannot
  parse `workspace:` and crashed consumer installs with `EUNSUPPORTEDPROTOCOL`.

    The release pipeline now rewrites `workspace:` ranges to real semver before
    packing and hard-fails the pack if any residual `workspace:` protocol survives
    in a packed tarball, so this cannot regress. No SDK source changed — this
    changeset only cuts a new version through the corrected pipeline.
    - triiiceratops@1.0.0-rc.26

## 1.0.0-rc.1

### Minor Changes

- 064bf1f: Add a core-owned-chrome activation path for SDK plugins, then complete the migration onto it as the only path: the legacy self-render path and the transitional `__coreChrome` marker on `SdkPluginMeta`/`definePlugin` are removed, and `dismiss` (`'light' | 'explicit'`, default `'light'`) declares whether an outside pointer-down closes a flyout.

    Add `definePluginStyles(css, id)` to the entry — a dependency-free helper that shapes a plugin's global stylesheet and its style-service install id into the `{ STYLES, STYLE_ID }` pair `context.styles.install(STYLES, STYLE_ID)` consumes, carrying the shared root-aware-install contract in one place. Also add a `@triiiceratops/plugin-sdk/register` subpath exporting `registerBrowserPlugin`, the self-contained helper that bootstraps the `window.Triiiceratops` namespace and registers a plugin factory into it (order-independent, first-registration-wins, never activates). Both helpers import nothing beyond erased types, so plugin IIFEs still bundle them with no SDK runtime or Svelte pulled in. The four first-party plugins now consume these shared implementations instead of each carrying byte-identical copies; runtime behavior is unchanged.

### Patch Changes

- Updated dependencies [064bf1f]
    - triiiceratops@1.0.0-rc.26
