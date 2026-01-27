---
'triiiceratops': patch
---

Changed `viewingMode` from a getter to a dedicated `$state` property with its own getter/setter to try and fix an issue where 'paged' viewing mode wasn't working in one consuming application
