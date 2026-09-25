---
'@triiiceratops/plugin-av': patch
'triiiceratops': patch
---

plugin-av declines containers typed other than `Canvas` or `Timeline`, leaving IIIF Scenes unclaimed; core shares `getContainerType` with the plugin IIFE.
