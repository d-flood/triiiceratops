---
'triiiceratops': patch
---

Use inline styles for gallery thumbnails because Tailwind v4 is using @property which isn't working for the web component (presumeably because of shadow dom weirdness)
