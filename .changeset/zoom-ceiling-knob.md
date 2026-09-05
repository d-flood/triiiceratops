---
'triiiceratops': minor
---

The zoom ceiling stops short of magnified blur, and is now configurable. The default is 8x the whole-canvas fit rather than 128x: because the fit falls as the source grows, the factor buys a large scan the depth it deserves — an 8000-pixel folio fitted into an 800-pixel viewport still reaches about 1:1 — while a modest image stops at 8x its own pixels instead of the 100x the previous ceiling allowed. `ViewerConfig.renderer.maxZoomFactor` overrides it; a factor of 1 or less is refused and takes the default, the same way `zoomPerClick` refuses one.
