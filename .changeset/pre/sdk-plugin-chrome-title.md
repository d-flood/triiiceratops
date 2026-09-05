---
'triiiceratops': patch
'@triiiceratops/plugin-sdk': patch
'@triiiceratops/plugin-pdf-export': patch
'@triiiceratops/plugin-image-export': patch
'@triiiceratops/plugin-image-manipulation': patch
---

Fix SDK plugin chrome being labelled with the raw package name. A plugin's toolbar tooltip/aria-label and its docked-panel header rendered `@triiiceratops/plugin-pdf-export` instead of "PDF Export": core passed `SdkPluginMeta.name` — the package-qualified identity — straight through as display copy, and then resolved it against CORE's message catalog, where a plugin's own title key never lives.

`definePlugin` gains an optional `title`. Core resolves it through the plugin's OWN `catalog` in the viewer's active locale (English fallback), so plugin titles stay translated and follow a `config.locale` change; a `title` with no matching catalog key renders verbatim, so a monolingual plugin can just write `title: 'My Plugin'`. All four first-party plugins now declare their existing catalog title keys, restoring their localized names (`PDF Export` / `PDF-Export`, `Download Image` / `Bild herunterladen`, `Image Adjustments` / `Bildanpassungen`, `Annotation Editor` / `Anmerkungs-Editor`). The image-manipulation flyout's toggle and dialog `aria-label` now also agree with the label announced inside it.

Backwards compatible: a plugin with no `title` renders exactly what it rendered before — its `name` looked up in core's catalog, else `name` verbatim. Do not work around this by overriding `name`: it keys the plugin registry, namespaces the plugin's injected styles, and sets `data-plugin-name`.
