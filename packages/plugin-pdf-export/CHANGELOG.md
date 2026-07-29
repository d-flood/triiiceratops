# @triiiceratops/plugin-pdf-export

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

### Patch Changes

- 064bf1f: Render `@triiiceratops/ui` primitives (and the plugin's own components) with idiomatic, Svelte-scoped `<style>` blocks while staying CSP-safe under a strict `style-src`. The build extracts component CSS (`emitCss: true` + the `@triiiceratops/ui/vite` `bundledCss()` helper) into a single string installed through the root-aware, nonce-aware SDK style service, instead of Svelte's runtime `append_styles` injection (which appends an un-nonced `<style>` the browser blocks). No stray stylesheet ships; the bundle stays self-contained.
- Updated dependencies [064bf1f]
- Updated dependencies [064bf1f]
    - triiiceratops@1.0.0-rc.26
    - @triiiceratops/plugin-sdk@1.0.0-rc.1
