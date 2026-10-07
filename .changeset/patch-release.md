---
'triiiceratops': patch
'@triiiceratops/plugin-sdk': patch
'@triiiceratops/plugin-annotation-editor': patch
'@triiiceratops/plugin-av': patch
'@triiiceratops/plugin-image-export': patch
'@triiiceratops/plugin-image-manipulation': patch
'@triiiceratops/plugin-pdf-export': patch
---

The canvas number in the nav now opens a list of all canvases, plugin dropdowns fill in options that load late, and `subscribe` no longer forces a flush that could break Svelte's `experimental.async`. Svelte peers now start at 5.29 for core and 5.57.2 for plugins, and the SDK also accepts vitest 3.
