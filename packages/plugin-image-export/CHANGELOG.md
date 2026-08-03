# @triiiceratops/plugin-image-export

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

### Minor Changes

- 2bdf833: Rename the package from `@triiiceratops/plugin-image-download` to `@triiiceratops/plugin-image-export`. npm's registry rejects the word "download" in new package names (400 "That word is not allowed"), so the package could not be published under its previous name. The plugin's registry id (the `definePlugin` name and the `window.Triiiceratops.plugins` key) tracks the package name and is now `@triiiceratops/plugin-image-export`. No runtime behavior, exported class (`ImageDownloadPlugin`), helper, or type name changes — only the package identity.

### Patch Changes

- triiiceratops@1.0.0-rc.26

## 1.0.0-rc.1

### Patch Changes

- 064bf1f: Migrate onto the core-owned-chrome path: core renders the toolbar button (from the plugin's icon) among the built-in buttons and owns open/close + docking. The self-rendered toggle and the corner `position: absolute` floating host are removed — `view.mount` renders only the panel content into the core-provided docked container. The panel's presentation is restored to the pre-monorepo themed look: controls render with the shared `@triiiceratops/ui` primitives (`Button`, `Select`) against the current `--tri-` theme tokens, in a body + footer layout matching the viewer's other docked panels, with idiomatic Svelte-scoped `<style>` blocks whose CSS is extracted at build time and installed through the root-aware, nonce-aware SDK style service (CSP-safe under a strict `style-src`, no stray stylesheet). Download behavior (IIIF fetch/compositing, output formats) and the structured `pluginerror` reporting are unchanged.
- Updated dependencies [064bf1f]
- Updated dependencies [064bf1f]
    - triiiceratops@1.0.0-rc.26
    - @triiiceratops/plugin-sdk@1.0.0-rc.1
