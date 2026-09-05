---
search:
  exclude: true
---

# The deep-zoom renderer is Canvas2D only — no WebGL, no backend selection, no fallback

The renderer draws through a single `CanvasRenderingContext2D`, with the backing store
capped at `min(devicePixelRatio, 2)` and an alpha channel so the viewer background stays
a themed CSS `background-color` on a parent element. There is no WebGL path, no runtime
backend choice, and therefore no device-sniffing drawer selection to maintain. This ADR
exists because "shouldn't this be WebGL?" is the question most likely to be asked afresh
every year by someone who has not seen the evidence, so the evidence is recorded here
rather than rediscovered: **Atlas**, the reference implementation this work draws on,
defaults to its Canvas renderer and gates WebGL behind an `unstable_` flag that *still*
requires a parity Canvas renderer composited underneath — the WebGL path never became
the one you ship; **Leaflet** draws raster tiles as plain DOM `<img>` elements, no
canvas at all; **OpenLayers** rasters to Canvas2D by default. The IIIF-adjacent and
mapping projects that did commit to WebGL did so for vector rasterization, free
rotation, and map pitch — not for raster tile throughput, which is dominated by decode
and upload, not by the blit. Our own previous renderer already forced its Canvas drawer
ahead of WebGL on iOS and Android Chrome, so the WebGL path was not even the shipped one
on the platforms most likely to need the help. Adding WebGL was rejected as buying
nothing measurable for the raster-tile workload while doubling the paint paths under
test; a runtime-selected pair of backends was rejected more firmly still, because two
renderers that must agree pixel-for-pixel is the parity burden Atlas's `unstable_` flag
is evidence of.

The costs are accepted, not overlooked, and they are what a future revisit should weigh:
Canvas2D gives no mipmapped minification, so heavy downscaling relies on the pyramid
choosing a coarser level rather than on hardware filtering; there is no free rotation, so
arbitrary viewport rotation is not offered; image adjustment is a CSS `filter` on the
surface rather than a shader, which bounds it to what CSS filter functions express
(brightness, contrast, saturation, invert, grayscale) and no further; and cross-fading
between pyramid levels is not cheap, so level transitions are handled by **blur-up** —
painting the incomplete finer level over the resident coarse chain, coarsest first —
rather than by blending. A requirement that genuinely needs one of those four — not a
general wish for speed — is the only thing that should reopen this.
