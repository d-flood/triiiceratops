---
'triiiceratops': patch
---

Fix a canvas being framed at the corner of the viewer in the built element only. The self-contained element builds minified with terser's `pure_getters`, which treats reading a property as free of side effects — untrue of a Svelte 5 `$derived`, which is subscribed to by being read. Effects that name a dependency as a bare read lost it to dead-code elimination, so a claimed audiovisual canvas whose companion geometry arrived after its world never received its opening fit: the picture landed half off the top-left of the surface, and pointer gestures over it missed the renderer entirely. The development server, which does not minify, was unaffected — so this only ever reproduced through `dist`.
