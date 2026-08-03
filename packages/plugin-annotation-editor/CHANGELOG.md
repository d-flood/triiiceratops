# @triiiceratops/plugin-annotation-editor

## 1.0.0-rc.7

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

## 1.0.0-rc.6

### Patch Changes

- 7ff8c4b: improve performance of annotation overlays and tooltip positioning
- Updated dependencies [7ff8c4b]
    - triiiceratops@1.0.0-rc.30
    - @triiiceratops/plugin-sdk@1.0.0-rc.5

## 1.0.0-rc.5

### Patch Changes

- b6bc43f: Fix SDK plugin chrome being labelled with the raw package name. A plugin's toolbar tooltip/aria-label and its docked-panel header rendered `@triiiceratops/plugin-pdf-export` instead of "PDF Export": core passed `SdkPluginMeta.name` — the package-qualified identity — straight through as display copy, and then resolved it against CORE's message catalog, where a plugin's own title key never lives.

    `definePlugin` gains an optional `title`. Core resolves it through the plugin's OWN `catalog` in the viewer's active locale (English fallback), so plugin titles stay translated and follow a `config.locale` change; a `title` with no matching catalog key renders verbatim, so a monolingual plugin can just write `title: 'My Plugin'`. All four first-party plugins now declare their existing catalog title keys, restoring their localized names (`PDF Export` / `PDF-Export`, `Download Image` / `Bild herunterladen`, `Image Adjustments` / `Bildanpassungen`, `Annotation Editor` / `Anmerkungs-Editor`). The image-manipulation flyout's toggle and dialog `aria-label` now also agree with the label announced inside it.

    Backwards compatible: a plugin with no `title` renders exactly what it rendered before — its `name` looked up in core's catalog, else `name` verbatim — and the legacy `PluginDef` path, where `name` IS documented display copy, is unchanged. Do not work around this by overriding `name`: it keys the plugin registry, namespaces the plugin's injected styles, and sets `data-plugin-name`.

- Updated dependencies [4eca8dc]
- Updated dependencies [b6bc43f]
    - triiiceratops@1.0.0-rc.29
    - @triiiceratops/plugin-sdk@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- Updated dependencies [809d6a6]
- Updated dependencies [63fe1bb]
    - triiiceratops@1.0.0-rc.28
    - @triiiceratops/plugin-sdk@1.0.0-rc.4

## 1.0.0-rc.3

### Patch Changes

- dfd84ab: Bundle the framework-neutral `triiiceratops/image-export` entry so Node ESM consumers can load it without extensionless relative imports, and inline the annotation editor's Annotorious stylesheet instead of emitting a Vite-only `?inline` package import.
- Updated dependencies [dfd84ab]
    - triiiceratops@1.0.0-rc.27
    - @triiiceratops/plugin-sdk@1.0.0-rc.3

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

### Patch Changes

- 064bf1f: Migrate onto the core-owned-chrome path and restore the panel presentation to the post-overhaul themed look: core now renders the toolbar button and provides the docked-panel / anchored-flyout surface, so the plugin no longer self-renders a toggle button or self-positions with `position: absolute` — `view.mount` renders content-only. The panel and default body editor render with the shared `@triiiceratops/ui` primitives (Button, Tooltip, Select, TextInput) on the current `--tri-` theme tokens, with idiomatic Svelte-scoped `<style>` blocks whose CSS is extracted at build time and installed through the root-aware, nonce-aware SDK style service (CSP-safe under a strict `style-src`, no stray stylesheet). The editing surface declares `dismiss: 'explicit'` so a flyout is not dismissed by canvas clicks. No change to the store, adapter, display sync, undo/redo, Annotorious integration, or body-editor persistence behavior.

    Consumes the core `triiiceratops/image-export` seam's canvas ↔ image coordinate-space helpers instead of carrying byte-identical copies of the core modules.

    Supports the generic `config.plugins['annotation-editor'].position` runtime override (see the core changeset); the plugin's own `AnnotationEditorConfig.position` construction-time option is removed — it never actually reached rendering and was silently ignored.

- Updated dependencies [064bf1f]
- Updated dependencies [064bf1f]
    - triiiceratops@1.0.0-rc.26
    - @triiiceratops/plugin-sdk@1.0.0-rc.1
