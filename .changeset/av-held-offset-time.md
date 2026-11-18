---
'@triiiceratops/plugin-av': patch
---

`AVState.currentTime` reports the time a navigation asked for until the media can seek there, so a captured content state keeps its `#t=` while media loads.
