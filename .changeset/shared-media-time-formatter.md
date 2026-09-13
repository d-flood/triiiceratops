---
'triiiceratops': minor
'@triiiceratops/plugin-av': patch
---

`formatMediaTime` is public, beside `parseIiifTime` it inverts, and is shared
through `window.Triiiceratops.core` rather than bundled a second time. The
structures panel formats a range's `#t=` span with it, so a range past the hour
reads `0:55:05` there and in the transport instead of `55:05` in one and
`0:55:05` in the other.
