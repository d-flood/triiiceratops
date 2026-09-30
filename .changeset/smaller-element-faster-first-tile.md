---
'triiiceratops': minor
'@triiiceratops/plugin-pdf-export': minor
'@triiiceratops/plugin-image-export': minor
'@triiiceratops/plugin-image-manipulation': minor
'@triiiceratops/plugin-annotation-editor': minor
'@triiiceratops/plugin-av': minor
---

The `<triiiceratops-viewer>` element is about 5% smaller (93.5 KB Brotli, down from 98.5 KB) and loads/paints the first tile sooner. No breaking changes Plugins now ship `svelte`-condition builds that share the host's Svelte runtime, and the PDF export IIFE loads pdf-lib from a separate chunk (105 KB, down from 543 KB).
