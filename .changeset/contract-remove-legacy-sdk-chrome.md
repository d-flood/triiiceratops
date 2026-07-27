---
'triiiceratops': patch
'@triiiceratops/plugin-sdk': patch
---

Complete the core-owned plugin-chrome migration (epic restore-plugin-toolbar-chrome,
ticket 07): remove the legacy SDK self-render path (the `tri-sdk-plugin-host` bare
host) and the transitional `__coreChrome` routing marker from `SdkPluginMeta` /
`definePlugin`. Every SDK plugin is now chrome-managed by core unconditionally —
one rendering path. Also fixes a latent core a11y defect surfaced once plugins add
toolbar buttons: the toolbar group separator is now an `<li role="separator">`
rather than a bare `<div>` inside the actions `<ul>`.
