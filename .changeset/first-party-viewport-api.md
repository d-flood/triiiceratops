---
'triiiceratops': major
'@triiiceratops/plugin-sdk': major
'@triiiceratops/plugin-image-manipulation': minor
'@triiiceratops/plugin-pdf-export': minor
'@triiiceratops/plugin-image-export': minor
---

**The raw OpenSeadragon viewer is no longer part of the public API, and nothing
replaces it as an object.** The renderer is first-party now, so the apparatus
that existed to negotiate a third party's versioning solves a problem that no
longer exists.

**Removed — breaking:**

- `ViewerState.osdViewer` and `ViewerState.notifyOSDReady`.
- The `osd@5` runtime capability, **retired with no successor**. There is
  deliberately no `renderer@1`: capabilities existed to version a dependency's
  major, and core's own surface is governed by core's semver, which `coreRange`
  already negotiates. A plugin still declaring `osd@5` now fails activation,
  which is correct — it needs an object that is gone.
- `ViewerConfig.openSeadragonConfig`.
- `whenOsdReady` from `@triiiceratops/plugin-sdk`, and `setOsdViewer` from both
  test kits.

**Added, as first-party API on `ViewerState`:**

- **Viewport commands** — `zoomIn()`, `zoomOut()`, `zoomTo(scale)`,
  `panTo(point)`, `fitBounds(box)`, `fitCanvas()`. These are the same calls the
  viewer's own toolbar and key bindings make, so anything the viewer can do to
  the viewport, a plugin can do too.
- **Query-only viewport state** — `viewportScale`, `viewportCentre`,
  `viewportBounds`, `containerSize`. These change every frame and deliberately
  never notify; read them reactively with a `frame`-cadence selector, which is
  what that cadence has always been for.
- **Coordinate helpers** — `canvasToScreen(point)` and `screenToCanvas(point)`,
  converting between **canvas space** (the IIIF Canvas's own dimensions, already
  the persistence format for annotation geometry) and **screen space**. An
  image's pixel dimensions no longer appear at the plugin boundary at all.
- **An image-adjustment command** — `setImageAdjustments({ brightness, contrast,
  saturation, invert, grayscale })` and `resetImageAdjustments()`. This replaces
  the practice of reaching into the renderer's drawer for its DOM node to set a
  CSS filter. The adjustment set is viewer state, so it is readable, testable
  without a renderer, replayed onto a renderer that mounts later, and it hands
  out no live node.
- **`ViewerConfig.renderer`** — a small, closed, typed set of knobs (animation
  time constant, zoom per click, minimum pixel ratio, decoded-byte budget,
  residency margin, tier thresholds). There is deliberately **no open
  partial-options escape hatch**: that is what made the renderer's internals part
  of the public contract in the first place.

**Readiness is a new signal, not a rename.** `ViewerState.rendererReady` means
"the renderer has a sized surface and accepts commands", where the old signal
meant "the third-party object exists, you may touch it". The SDK's helper is now
`whenRendererReady(state)`, a **first-paint signal** resolving `void` — there is
no object to hand over. Most plugins need no gate at all: commands are no-ops
before a renderer mounts and the queries answer `0`/`null`, so only code
positioning something over the image has to wait.

The `frame` **selector cadence is unchanged as a concept**; only its event
source moved, from OpenSeadragon's animation events to core's own
`ViewerState.subscribeFrame`. Existing `cadence: 'frame'` projections keep
working — replace `state.osdViewer?.viewport.getZoom()` with
`state.viewportScale`.

`fitBounds` refuses a box that is not a usable rectangle (non-finite, or a zero
or negative extent) the same way `zoomTo` refuses an unusable scale, and the
scale it lands on is clamped to the renderer's zoom range — so no viewport
command can leave the range the toolbar and keyboard are held to.

**Test kits:** `handle.attachRenderer()` (core) and `context.attachRenderer()`
(SDK) mount a headless renderer stand-in that core now ships, since the renderer
is first-party and there is one right answer to what a stand-in should report.
It makes the `frame` cadence and the viewport queries exercisable with no DOM,
and it records the commands it receives. Pass `canvasIds` to make it answer
`null` for any other canvas — the honest-absence contract a real host follows
for a canvas it has not laid out, which is what a plugin's overlay has to
handle.

**Plugins:** image-manipulation, pdf-export, and image-export migrated to the new
surface and no longer declare any capability. **Annotation editing is
unavailable** in this release: Annotorious's OpenSeadragon integration requires
the raw viewer instance and no shim was built for it. That plugin deliberately
keeps declaring `osd@5`, so registering it now fails activation with the
structured capability error that says why, rather than installing a button that
does nothing.
