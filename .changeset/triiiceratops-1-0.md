---
'triiiceratops': major
---

Triiiceratops 1.0. The viewer ships one first-party renderer, opens audiovisual
canvases as well as images, and its public surface is settled.

#### The renderer is core's own

**OpenSeadragon is gone.** The image surface is core's own API on `ViewerState`
— viewport commands and queries, `canvasToScreen`/`screenToCanvas`,
`setImageAdjustments`, `setViewportInset`, `subscribeFrame`,
`subscribeSurfaceTap`, `registerOverlayLayer`, `registerPaintLayer`. `osdViewer`,
`notifyOSDReady`, `openSeadragonConfig` and the `osd@5` capability are removed;
readiness is `rendererReady` / `whenRendererReady`.

Multi-canvas rendering arrives with it: facing pages, composite canvases,
`Choice` selection, IIIF v2 `viewingHint`, and a `continuous` mode that opens an
800-folio manuscript in O(1) requests.

A canvas with a duration and no picture is laid out as a **lane** rather than as
a page: with nothing to declare a rect — no dimensions, no image to reflow from,
no companion Canvas — a bare audio canvas takes the surface's own shape instead
of the square that stands in for an unknown shape, so a lone recording opens as
a timeline filling the viewer. Where such a canvas is the whole world, zoom and
pan are purely temporal: the floor is the fit (the whole recording, full width),
zooming in widens the rect while the waveform stays full height, and the centre
is pinned vertically so the reader pans only along time. `PlannerCanvas` carries
the Canvas's declared `duration` for that decision, and
`PlanWorldInput.surfaceAspect` is the container shape that rung reads.

**The zoom ceiling stops short of magnified blur, and is now configurable.** The
default is 8x the whole-canvas fit rather than 128x: because the fit falls as the
source grows, the factor buys a large scan the depth it deserves — an
8000-pixel folio fitted into an 800-pixel viewport still reaches about 1:1 —
while a modest image stops at 8x its own pixels instead of the 100x the previous
ceiling allowed. `ViewerConfig.renderer.maxZoomFactor` overrides it; a factor of
1 or less is refused and takes the default, the same way `zoomPerClick` refuses
one.

**A static level-0 tile tree renders even when it spells its whole-image
derivative the other legal way.** The base level of such a pyramid is one tile
covering the whole image, and the trees in the wild disagree about what to name
that file: `vips dzsave --layout iiif3` — and so every page `mkiiif` generates —
writes only `full/{tw},{th}`, while CSNTM is split against itself, its 𝔓3 tree
answering both spellings and its 𝔓40 tree only the explicit region
`0,0,{w},{h}/{tw},{th}`. The whole-image request is now spelled with the
canonical `full` region, which Image API 3.0 §4.8 names as canonical for exactly
this reason — a static file tree "will have only a single URI at which the
content is available" — and which every OpenSeadragon-based viewer already sends.
The explicit region is carried as the tile's fallback, scoped to the service, so
one 404 settles it for every whole-image request that tree receives. A
`vips`-generated tree previously painted nothing at all: `tiles` alone is enough
to derive its levels, but its base level 404'd and the finer levels never covered
the gap.

#### Audiovisual canvases

New core seams for non-image content: `claimCanvas`/`isCanvasClaimed`/
`claimedCanvases`, `canvasSize`, and a shared painting-body classifier
(`isUnsupportedCanvasFor`, `isImageBody`, `paintingBodyAlternatives`,
`companionPaintable`) so audiovisual canvases degrade honestly instead of hitting
the image pipeline. `@triiiceratops/plugin-av` is the first-party claimant built
on them.

Playback controls live in the viewer's control bar via the media-agnostic
`transport-chrome` seam, and the whole bar idle-hides over a claimed canvas
(`IDLE_CHROME_DELAY_MS`, `canIdleHide`).

`ViewerState.chromeInset` reports the edges of the surface core's own control bar
is covering while it shows — the mirror of `viewportInset`, which is a plugin
telling core where not to fit. Core writes it from the bar; there is no mutator,
and every edge is zero while the bar idle-hides.

`parseIiifTime` is exported publicly and on the `window.Triiiceratops.core`
namespace, so a claimant reads media-fragment times through core's parser.

#### Chrome

- **Every button in the control bar now has a hover tooltip.** The zoom and
  canvas-navigation buttons were the only chrome in the viewer without one — the
  toolbar's buttons and the transport's play, mute, captions and transcript
  controls all had them, so the bar labelled some of its controls and not others.
  Tooltips point away from the edge the bar is docked to, as the transport's
  already did, and the trailing button's bubble is anchored to its own end edge
  so it is not clipped by the viewer border. `Zoom In` and `Zoom Out` were
  hardcoded English accessible names and are now translated, since the tooltip
  makes them visible text.
- **The control bar gets a fit-to-viewer button**, to the right of the zoom pair,
  and `ViewerState.fitView()` behind it. It re-frames what the reader is looking
  at — the laid-out world, or in `continuous` mode the canvas their viewport is
  over — which is what the `0`/`Home` key has always done and what the canvas
  surface's accessible name has always advertised. Reaching for the existing
  `fitCanvas()` here would have been wrong: naming a canvas is a request to
  TRAVEL to it, so after a scroll in `continuous` mode it returns the reader to a
  folio they left behind, and in `paged` mode it fits one page of a two-page
  spread. Refitting is the opposite request, so it names nothing. The parity rule
  puts the same command on `ViewerState` that the chrome's own button uses.
- The floating thumbnail gallery and the drag-a-URL drop are removed; the gallery
  is always docked and gets a toolbar placement picker. `gallery.draggable`/
  `width`/`height`/`x`/`y`, `dockPosition: 'none'` and `enableDragDrop` are gone,
  along with the state members behind them. The two gallery toolbar buttons
  collapse into one.
- The transport's panel control is named for what the current canvas actually
  offers, so a button labelled "Transcript" never opens a panel holding only
  notes; a canvas offering neither leaves the control out and never fetches the
  panel's chunk. The transport's buttons carry the toolbar's own hover tooltips,
  and the annotations action is left out of the toolbar on a claimed canvas.
- The AV panel opens at the viewer's full height.
- Closing a panel docked on the same side as a side-positioned toolbar animates
  in one step rather than two.
- Every selector in the chrome shares one surface: the toolbar's flyouts and the
  transport's caption-track list are the same glass panel, row metrics and
  selected-row fill, from a new shared layer in the published stylesheet
  (`.tri-menu`, `.tri-menu-surface`, `.tri-menu-item`).

#### Four themes, and a named default

Four themes ship, and a viewer with no `theme` now paints `light`.

The stylesheet had a fifth palette that nothing could name. `themes.css` carried
a `prefers-color-scheme: dark` block that survived the removal of Tailwind and
daisyUI still holding daisyUI's indigo primary and cooler neutral, and its light
half had drifted from `[data-theme="light"]` by a button radius. Because no name
selected it, nothing rendered it deliberately, the theming reference never
documented it, and `check-contrast.ts` — which walks the four named themes —
never measured its contrast.

So the block is gone and the defaults block is now `light`'s own values, token
for token, with `theme/defaults.test.ts` holding the two together and asserting
the stylesheet declares exactly the themes `BUILTIN_THEMES` names.

**What changes for a deployment:** a viewer that sets no `theme` used to follow
the reader's `prefers-color-scheme` — and, in dark, to paint a palette nobody
designed. It now paints `light` whatever the reader prefers. Which scheme a
reader sees is the host page's decision rather than the component's: a component
that turned dark inside a light page overrules the page it sits in, and a media
query has no answer while a host prerenders. Following the reader stays one line
where a page wants it:

```svelte
<TriiiceratopsViewer manifestId="…" theme={prefersDark.current ? 'dark' : 'light'} />
```

A deployment that named a theme, or that sets its own tokens through
`themeConfig` or CSS variables, is unaffected.

#### Cookbook coverage

Four more IIIF Cookbook recipes render, and the public surface they needed grows
with them.

- **Content state (recipes 0466, 0485).** An `iiif-content` payload is now read in
  both spellings the specification permits: JSON as it stands, and JSON put
  through `encodeURIComponent` before base64url, which is how the Cookbook
  publishes its own examples. Which spelling a payload uses is decided by
  attempting the parse rather than by looking for a percent sign, so a `%` inside
  a legitimate JSON string value no longer provokes a second decode.
- **Multilingual annotation bodies (recipe 0346).** A `Choice` body renders the
  one item matching the reader's language — exact tag first, then the primary
  subtag, then the manifest's own item order, which is how the recipe has authors
  express preference. `extractBody`, `parseAnnotation` and `parseAnnotations`
  take a trailing optional `locale`; the unselected alternatives are dropped
  silently, because that is a Choice behaving as designed.
- **Annotation bodies that are external resources (recipe 0258).** A body tagging
  a region with an authority record rather than a phrase — a `SpecificResource`
  whose `source` is a URI, carrying no text — is followable instead of blank. The
  rendered body type is now exported as `AnnotationBody` and carries an optional
  `href` alongside `value`, kept apart from it so no consumer prints a bare URI
  as prose. Only an absolute `http`/`https` identity is admitted: a `javascript:`
  or `data:` source is refused where the body is parsed, not where it is
  rendered.
- **Ranges that target canvas regions (recipe 0025).** A structure item naming an
  `xywh` region — the articles of a newspaper page — navigates to that region
  rather than to the whole canvas. `StructureNode` gains a `canvasRegions` array,
  index-aligned with `canvasIds` and `canvasTimes` so the spatial and temporal
  halves of a target stay in step; it is required, on a type core produces rather
  than one a consumer constructs. `ViewerState` gains `navigationRegion` and
  `takeNavigationRegion(canvasId)`, and `setCanvas` a third optional `region`
  parameter. The region is consumed rather than standing, so it cannot outlive
  the navigation that supplied it and spring on a later canvas.

#### Rich text

IIIF rich text is rebuilt from IIIF's own allowlist through a single seam and
`dompurify` is dropped; search excerpts render as text nodes rather than raw
HTML.

#### Extension surface

`window.Triiiceratops` publishes core's Svelte runtime and a curated `core`
utility set for first-party IIFEs. Plugin API 1.0.0 → 1.6.0 across five declared
capabilities.

`MULTI_CANVAS_GAP` is replaced by a `gap` option on `getCanvasDisplayLayouts`
(exported from `triiiceratops/image-export`).

Core's deprecated `triiiceratops:annotation-editor:request-edit` window
`CustomEvent` is removed. It was deprecated in `1.0.0-rc.36`, had no listener,
and in-viewer edit coordination is the per-viewer `annotationEditBus` channel.

#### Fixes

- **A canvas was framed at the corner of the viewer in the built element only.**
  The self-contained element builds minified with terser's `pure_getters`, which
  treats reading a property as free of side effects — untrue of a Svelte 5
  `$derived`, which is subscribed to by being read. Effects that named a
  dependency as a bare read lost it to dead-code elimination, so a claimed
  audiovisual canvas whose companion geometry arrived after its world never
  received its opening fit: the picture landed half off the top-left of the
  surface, and pointer gestures over it missed the renderer entirely. The
  development server, which does not minify, was unaffected — so this only ever
  reproduced through `dist`.
- **A configured `search.query` is resolved against the manifest it arrived
  with.** A host that changed the manifest and the query in one update applied
  the config while `setManifest` was still in flight, so the search went to
  whichever service the OUTGOING manifest declared — or to none — and answered
  "no results" for a query the reader could then run by hand and watch succeed.
- **A navigation carrying a region to the canvas already showing now frames it.**
  A IIIF Content State dropped onto the viewer, or a table-of-contents entry
  pointing into the open leaf, changes no canvas, no spread and no Choice, so the
  renderer found nothing owed and left the region unspent until some later
  navigation moved the reader.
- **A content state delivered as a bare manifest URI no longer refetches the
  manifest under its declared `id`.** A Manifest served at one URL and declaring
  another is legal and common — `mkiiif` writes `manifest.json` beside an
  `index.html` and gives the Manifest the directory's URI — and the second fetch
  returned that HTML page and failed to parse. The document already in hand is
  handed to the manifest load instead.

#### Docs

AV support, published plugin state, and the bundle-size comparison are brought up
to date.
