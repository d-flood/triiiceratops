---
'triiiceratops': major
'@triiiceratops/plugin-sdk': major
'@triiiceratops/plugin-av': minor
'@triiiceratops/plugin-annotation-editor': minor
'@triiiceratops/plugin-image-export': minor
'@triiiceratops/plugin-image-manipulation': minor
'@triiiceratops/plugin-pdf-export': minor
---

- **OpenSeadragon is gone.** The viewer ships one first-party renderer; the image surface is core's own API on `ViewerState` (viewport commands and queries, `canvasToScreen`/`screenToCanvas`, `setImageAdjustments`, `setViewportInset`, `subscribeFrame`, `subscribeSurfaceTap`, `registerOverlayLayer`, `registerPaintLayer`). `osdViewer`, `notifyOSDReady`, `openSeadragonConfig` and the `osd@5` capability are removed; readiness is `rendererReady` / `whenRendererReady`.
- Multi-canvas rendering: facing pages, composite canvases, `Choice` selection, IIIF v2 `viewingHint`, and a `continuous` mode that opens an 800-folio manuscript in O(1) requests.
- IIIF rich text is rebuilt from IIIF's own allowlist through a single seam and `dompurify` is dropped; search excerpts render as text nodes rather than raw HTML.
- New `@triiiceratops/plugin-av`: claims audiovisual canvases, renders their media, publishes commandable `AVState` (`getPluginState('av')` / `getAVState`).
- Playback controls live in the viewer's control bar via the media-agnostic `transport-chrome` seam, and the whole bar idle-hides over a claimed canvas (`IDLE_CHROME_DELAY_MS`, `canIdleHide`).
- A canvas with a duration and no picture is laid out as a timeline rather than as a page: with nothing to declare a rect — no dimensions, no image to reflow from, no companion Canvas — a bare audio canvas takes a wide, short box instead of the square that stands in for an unknown shape, so its stage reads as a waveform band rather than as a block. `PlannerCanvas` carries the Canvas's declared `duration` for that one decision.
- New core seams for non-image content: `claimCanvas`/`isCanvasClaimed`/`claimedCanvases`, `canvasSize`, and a shared painting-body classifier (`isUnsupportedCanvasFor`, `isImageBody`, `paintingBodyAlternatives`, `companionPaintable`) so audiovisual canvases degrade honestly instead of hitting the image pipeline.
- `window.Triiiceratops` publishes core's Svelte runtime and a curated `core` utility set for first-party IIFEs. Plugin API 1.0.0 → 1.4.0 across five declared capabilities.
- The floating thumbnail gallery and the drag-a-URL drop are removed; the gallery is always docked and gets a toolbar placement picker. `gallery.draggable`/`width`/`height`/`x`/`y`, `dockPosition: 'none'` and `enableDragDrop` are gone, along with the state members behind them.
- **SDK narrowing (breaking):** `satisfies` accepts only exact, caret and `>=` ranges and throws on the rest; `PluginCompatibilityReason` and `collectIncompatibilities` are removed; `PluginHost` requires all five services and the `createStub*` factories move to `@triiiceratops/plugin-sdk/testing`. New `@triiiceratops/plugin-sdk/register-shared` subpath.
- The export and manipulation plugins are migrated onto core's first-party APIs and declare no `requiredCapabilities`; `MULTI_CANVAS_GAP` is replaced by a `gap` option on `getCanvasDisplayLayouts`. Alert text in the image-export download panel is legible under the dark themes.
- **`@triiiceratops/plugin-annotation-editor` is not published this release.** It is paused pending the phase-2 drawing layer and still declares `osd@5`, so registering it fails activation with a structured error.
- Docs: AV support, published plugin state, and the bundle-size comparison are brought up to date.
