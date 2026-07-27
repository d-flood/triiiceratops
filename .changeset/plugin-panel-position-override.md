---
'triiiceratops': patch
'@triiiceratops/plugin-annotation-editor': patch
---

Let a consuming app decide where a plugin's docked panel opens, at runtime,
instead of being stuck with whatever the plugin authored: `config.plugins[id].position`
(`'left' | 'right' | 'bottom' | 'overlay'`) now reactively overrides the panel's
dock side, for any plugin — SDK (`definePlugin`) or legacy `PluginDef` alike —
mirroring the existing `config.plugins[id].target` mechanism. New
`ViewerState.getPluginPosition`/`setPluginPosition` mirror `getPluginTarget`/
`setPluginTarget`. `PluginPanel.position` — the old static field baked on at
registration — is removed; the effective position now lives only in reactive
per-plugin UI state, read by the four panel render sites. `PluginDef.position`
(a plugin's authored default, legacy path) is unchanged and unaffected;
`definePlugin` still has no `position` field — a panel's dock side is always a
consumer decision, never the plugin's.

`@triiiceratops/plugin-annotation-editor`'s `AnnotationEditorConfig.position`
is removed: it was a construction-time option (`createAnnotationEditorPlugin({
position })`) that never actually reached rendering and was silently ignored.
Use the generic `config.plugins['annotation-editor'].position` override
instead — it already works today and applies reactively, unlike the removed
option.
