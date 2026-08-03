# @triiiceratops/plugin-image-manipulation

## 1.0.0-rc.5

### Patch Changes

- Updated dependencies [6510417]
- Updated dependencies [246dbda]
- Updated dependencies [f7630d2]
- Updated dependencies [971e748]
- Updated dependencies [4afa631]
- Updated dependencies [b975980]
- Updated dependencies [2f9538c]
- Updated dependencies [1fae8dd]
- Updated dependencies [140c2c0]
- Updated dependencies [cef4153]
- Updated dependencies [90a5701]
- Updated dependencies [2c9dcdb]
- Updated dependencies [15fd990]
- Updated dependencies [140c2c0]
    - triiiceratops@1.0.0-rc.33
    - @triiiceratops/plugin-sdk@1.0.0-rc.6

## 1.0.0-rc.4

### Patch Changes

- b6bc43f: Fix SDK plugin chrome being labelled with the raw package name. A plugin's toolbar tooltip/aria-label and its docked-panel header rendered `@triiiceratops/plugin-pdf-export` instead of "PDF Export": core passed `SdkPluginMeta.name` — the package-qualified identity — straight through as display copy, and then resolved it against CORE's message catalog, where a plugin's own title key never lives.

    `definePlugin` gains an optional `title`. Core resolves it through the plugin's OWN `catalog` in the viewer's active locale (English fallback), so plugin titles stay translated and follow a `config.locale` change; a `title` with no matching catalog key renders verbatim, so a monolingual plugin can just write `title: 'My Plugin'`. All four first-party plugins now declare their existing catalog title keys, restoring their localized names (`PDF Export` / `PDF-Export`, `Download Image` / `Bild herunterladen`, `Image Adjustments` / `Bildanpassungen`, `Annotation Editor` / `Anmerkungs-Editor`). The image-manipulation flyout's toggle and dialog `aria-label` now also agree with the label announced inside it.

    Backwards compatible: a plugin with no `title` renders exactly what it rendered before — its `name` looked up in core's catalog, else `name` verbatim — and the legacy `PluginDef` path, where `name` IS documented display copy, is unchanged. Do not work around this by overriding `name`: it keys the plugin registry, namespaces the plugin's injected styles, and sets `data-plugin-name`.

- Updated dependencies [4eca8dc]
- Updated dependencies [b6bc43f]
    - triiiceratops@1.0.0-rc.29
    - @triiiceratops/plugin-sdk@1.0.0-rc.5

## 1.0.0-rc.3

### Patch Changes

- Updated dependencies [809d6a6]
- Updated dependencies [63fe1bb]
    - triiiceratops@1.0.0-rc.28
    - @triiiceratops/plugin-sdk@1.0.0-rc.4

## 1.0.0-rc.2

### Patch Changes

- c2505b4: Republish to supersede `1.0.0-rc.1`, whose published tarball carried
  `workspace:^` peer-dependency protocols on `triiiceratops` and
  `@triiiceratops/plugin-sdk` (leftover monorepo linking that was never rewritten
  to real semver ranges). npm cannot parse `workspace:` and crashed consumer
  installs with `EUNSUPPORTEDPROTOCOL`. The release pipeline now rewrites
  `workspace:` ranges before packing and hard-fails the pack on any residual
  `workspace:` protocol, so this cannot regress. No source changed — this
  changeset only cuts a new version through the corrected pipeline.
    - triiiceratops@1.0.0-rc.26

## 1.0.0-rc.1

### Minor Changes

- 064bf1f: Migrate onto the core-owned-chrome path and restore the Flyout to `main`'s design: the plugin sets `dismiss: 'explicit'`, deletes its self-rendered toggle button and `position: absolute` positioning, and renders content-only into the core-provided anchored container — core now renders the toolbar button from `meta.icon` and owns open/close, anchoring, and placement. The Flyout is again a boxless set of three vertical sliders (a themed range rotated −90°) floating over the canvas above a frosted glass base with icon + percentage labels and tooltip-wrapped invert/grayscale/reset actions, using the current `--tri-` theme tokens. It is now idiomatic Svelte, rendering the shared `@triiiceratops/ui` `Range` and `Tooltip` primitives with a Svelte-scoped `<style>` block whose CSS (its own plus the bundled UI primitives') is extracted at build time and installed through the root-aware, nonce-aware SDK style service — CSP-safe under a strict `style-src`, no stray stylesheet.

    Filter state now lives in an Activation-scoped controller created in `view.mount` (per viewer, above the mounted component): the last slider positions survive close→reopen, closing the Flyout leaves the adjustment visible (no reset on close), and filters reset to default on canvas change and on deactivation whether the Flyout is open or closed. Filters are written to the raw OSD canvas via the OSD pass-through, gated on OSD readiness.

### Patch Changes

- Updated dependencies [064bf1f]
- Updated dependencies [064bf1f]
    - triiiceratops@1.0.0-rc.26
    - @triiiceratops/plugin-sdk@1.0.0-rc.1
