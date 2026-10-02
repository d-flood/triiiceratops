# Triiiceratops Glossary

Canonical vocabulary for the triiiceratops IIIF viewer. When code, docs, issues, or
conversation need one of these concepts, use the term defined here.

## Annotation domain

**Adapter**:
The host-supplied storage backend for annotations: pure persistence functions
(`load`/`create`/`update`/`delete`, optional `hydrate`) with no display, id-bookkeeping,
or stamping responsibilities.
_Avoid_: storage provider, backend, connector

**Store**:
The plugin-internal persistence layer that wraps the adapter and owns everything the
adapter must not: caching, create-vs-update resolution, display sync, reconciliation,
stamping, and error rollback.
_Avoid_: cache (for the whole layer), repository

**Display sync**:
Making persisted annotations visible in the read-only overlay by injecting them into the
owning viewer's display state after each successful persistence operation. Plugin-owned
and per viewer instance.
_Avoid_: injection (alone, without saying what is injected where), shared display state

**Painting annotation**:
An annotation that places image content onto a canvas (v2 `canvas.images[]`, v3
`canvas.items[]`) — what the viewer renders as the image. The one use of "annotation"
here that does _not_ mean commentary.
_Avoid_: image annotation (conflates the annotation with its Image body), canvas
annotation (ambiguous — `ensureCanvasAnnotations` returns commentary), content
(Manifesto's v3 term)

**Manifest annotation**:
A commentary annotation defined by the manifest itself (v2 `otherContent`, v3
`canvas.annotations`), as opposed to a user annotation created through the
annotation-editor plugin.
_Avoid_: external annotation (that describes the fetch, not the origin)

**Point annotation**:
An annotation whose target selector is a IIIF `PointSelector` — a single exact point on
a canvas, not a small region.
_Avoid_: marker, pin, point-ish rectangle

**Canvas space**:
Coordinates expressed in the IIIF canvas's own dimensions — the persistence format for
all annotation geometry.

**Image space**:
Coordinates expressed in the underlying image's pixel dimensions — the space the tile
pyramid is addressed in. Core-internal: it never appears at the plugin boundary.
_Avoid_: pixel space, screen space (the viewport's own coordinates, a third thing)

**Draft**:
The annotation as enriched by the host's `prepareDraft` hook before it is first
persisted. What the user sees and what gets saved are both the draft, never the raw
drawn shape.

**Hydration**:
Fetching an annotation's full body on demand (typically at selection) when the adapter
returned only a skeleton from `load`.
_Avoid_: bare "hydration" for Svelte attaching to server-rendered markup — say "SSR
hydration"

**Skeleton**:
A partially loaded annotation whose body is a preview/stub pending hydration. A
skeleton body must never be saved over a full one.
_Avoid_: stub, partial (as nouns)

**Stamping**:
The plugin filling in required W3C annotation fields (`@context`, `type`, `creator`,
`created`/`modified`, `motivation`) before persistence, without clobbering
host-provided values.
_Avoid_: enrichment (that's what the host's draft hooks do)

**Reconciliation**:
Swapping the plugin's temporary annotation id for the canonical id the server minted on
create, everywhere at once.

**Canonical id**:
The server-assigned annotation IRI after reconciliation; the only id used for
subsequent `update`/`delete`.
_Avoid_: real id, server id (in code)

**Drawing layer**:
The annotation editor's own overlay layer, holding only the annotation currently being
edited, its handles, and the in-progress preview. It makes drawing modal, taking pointer
events across the surface while a tool is armed.
_Avoid_: manager, editing layer, canvas (nothing here is a `<canvas>`)

**Body editor**:
The UI inside the editor card that edits an annotation's bodies — the built-in
`{purpose, value}` editor or a host-supplied one.
_Avoid_: annotation editor (that's the whole plugin)

**Extension**:
The host-provided hook object through which a host customizes plugin behavior without
forking it.
_Avoid_: plugin (the whole annotation-editor plugin), hooks object

## Viewer state domain

**Framework wrapper**:
A React or Vue component that hosts the Triiiceratops custom element and translates its
lifecycle, properties, and viewer state into the framework's idioms. It never owns a
second viewer.
_Avoid_: framework-native viewer, adapter (reserved for annotation persistence)

**Viewer state**:
The per-viewer live state object (`ViewerState`) — the sole state contract for plugins
and framework wrappers. There is no second framework-specific state surface.
_Avoid_: viewer store, global state

**Manifest cache**:
The page-shared cache of fetched and parsed manifests. Internal: plugins reach manifest
data only through viewer state.
_Avoid_: manifests state (as a plugin-facing concept)

**Command state**:
Viewer state a plugin may change through a supported command (mutation method).
Readable and notifying; coverage is set by the parity rule.
_Avoid_: setter, writable property (commands maintain invariants; they are not field writes)

**Observable state**:
Viewer state that mirrors an external fact (network errors, fetch progress): readable
and notifying, but with no supported mutator.
_Avoid_: read-only state (it changes; plugins just don't write it)

**Parity rule**:
Anything the viewer's own UI can do, a plugin can do through a supported command. The
arbiter for what must be command state.

**State inventory**:
The checked-in, reviewed table classifying every mutable viewer-state member as command
state, observable state, or internal.

**Notification**:
The batched, payload-free wake-up a viewer-state subscriber receives after any
inventoried member changes. It means "state changed — read what you need": no change
list, intermediate states collapsed.
_Avoid_: event (notifications are not a transition log)

**Selector**:
The framework-neutral memoized `{ get(), subscribe() }` view of viewer state,
propagating only when its selected value fails the equality gate.

**Selector cadence**:
Which notification wakes a selector: `state` (the default batched notification) or
`frame` (the source's own per-frame notification). Frame cadence is how continuous
values are read reactively without flooding notifying state.
_Avoid_: unbatched notification, polling (frame cadence is event-driven, not a loop)

**Query-only state**:
High-frequency values, such as continuous viewport position, readable on demand but
deliberately non-notifying. Reading them reactively is a selector cadence choice, not a
reclassification.

**Active locale**:
The locale a viewer instance renders in: its picker's choice, otherwise its configured
locale, otherwise the page default. A _content_ locale, ranging over whatever languages
a manifest is authored in.
_Avoid_: the locale, current language (ambiguous about whose)

## Renderer domain

**Container**:
IIIF Presentation 4's abstract class for anything content is painted onto: `Canvas`,
`Timeline`, or `Scene`. Core's "canvas" vocabulary — every "canvas" in this glossary —
means Container throughout.
_Avoid_: bare "scene" for the IIIF class (collides with **scene plan**; say "IIIF Scene")

**Scene plan**:
The planner's pure, deterministic output for one frame: layout rects, residency tiers,
ordered requests, eviction candidates, and the zoom floor. The painter consumes it and
only draws.
_Avoid_: render state, frame state (a scene plan is produced and discarded each frame,
not held)

**Residency tier**:
Which of three treatments a canvas receives, chosen per frame from its projected size on
screen:

- **Pyramid tier**: large enough to hold a full tile pyramid — the only tier that
  fetches tiles.
- **Thumbnail tier**: one static image sized to its projection, with no pyramid.
- **Box tier**: its layout rect only — no network, no texture.

_Avoid_: LOD, zoom level (a tier is about a canvas; a level is about a pyramid)

**Required set**:
What must be resident and is never evicted while required, derived from the viewport.
_Avoid_: cache (membership is derived from the viewport, not from recent use)

**Opportunistic cache**:
The byte-budgeted LRU holding what recently dropped out of the required set.

**Size-ladder source**:
A level0 image service advertising only fixed sizes, with no tiling — modeled as a
pyramid whose every level holds one tile, so one level-choice rule serves both source
kinds.
_Avoid_: static source (a canvas with no image service at all)
_Note_: a service with no `tiles` is a size-ladder source only if it is also level0;
level 1/2 services omit `tiles` too and serve arbitrary regions.

**Paint hook**:
An ordered, per-frame drawing layer a plugin registers, painted after tiles. For
decoration or a second rendering of geometry the DOM already carries; anything a reader
must perceive or operate belongs in an **overlay layer**.

**Overlay layer**:
A DOM container a plugin registers beside the renderer in the viewer's stage, positioned
by the plugin on the `frame` cadence. It persists from registration to dispose,
surviving manifest changes.
_Avoid_: overlay panel (a plugin **panel** at the overlay position, which is chrome)

**Viewport inset**:
Edges of the surface a plugin has reserved, in screen pixels, that **fits** frame into,
so content lands where the reader can see it rather than behind the plugin's floating
UI. Affects fit targets only.
_Avoid_: margin, padding (both suggest a box model rather than a fit target)

**Docked chrome**:
Chrome core docks beside the viewer that takes width or height from it: a side panel
column, a toolbar rail, a top or bottom gallery band. Floating chrome and window resizes
are not docked chrome.
_Avoid_: sidebar, panel (either names one member), overlay chrome (the floating kind,
the opposite)

**Surface compensation**:
The renderer's response when **docked chrome** takes surface away or gives it back: it
preserves the canvas-space extent visible on the changed axis and leaves the center
alone, so toggling a panel neither crops the canvas nor drifts the reader's zoom.
_Avoid_: re-fit, refit (the rule it replaced), `compensateForReflow` (reflow
compensation, which holds a reader's place across a layout change and does move the
center)

**World refit**:
The renderer framing its world afresh, writing an absolute scale and center and
discarding the reader's view. A response to a change of **world** — manifest, viewing
mode, reading direction, scale policy, current canvas, or layout — never to a change of
state such as opening a panel.
_Avoid_: reset, snap back (symptoms of an unwanted refit), refresh (suggests repainting)

**Unsupported presentation**:
The first-class rendering of a canvas with nothing core can display: it keeps its layout
rect and place in navigation and paints an honest "unsupported content" treatment. Not
an error.
_Avoid_: error placeholder (that is `CanvasErrorKind`, a load failure), broken canvas

**Canvas claim**:
A plugin taking ownership of the non-image content of one canvas in one viewer
instance. It suppresses the unsupported presentation and makes the canvas eligible for a
**companion phase**; core still paints its image bodies. One claimant per canvas.
_Avoid_: canvas takeover, render veto (a claim does not stop core's image painting)

**Companion phase**:
Which companion Canvas — `placeholderCanvas` or `accompanyingCanvas` — core paints for a
claimed canvas right now (`'none' | 'placeholder' | 'accompanying'`). Set only by the
claimant, which contributes only timing.
_Avoid_: painted companion (nothing is handed over — core resolves the Canvas itself),
companion payload (the seam carries only an enum)

**Input claim**:
A consumer temporarily owning pointer input, suppressing pointer pan and zoom for its
duration. Wheel and keyboard zoom are unaffected.
_Avoid_: capture (the DOM pointer-capture mechanism, one implementation detail)

## Plugin lifecycle

**Registration**:
A plugin factory being added to the browser runtime namespace (or passed to the viewer
in module builds). Order-independent and side-effect-free; it never activates anything.
_Avoid_: loading, installing (both conflate script delivery with registration)

**Activation**:
Explicitly attaching a registered plugin to one viewer instance: where compatibility is
negotiated and isolated per-viewer plugin state is created. A plugin can register
successfully and still fail activation.
_Avoid_: enabling, mounting (mounting is the UI step inside a successful activation)

**Test viewer context**:
The SDK test kit's plugin-test harness: a real compiled viewer state with recording
doubles for the style, UI, and locale services, and no renderer. The harness is fake;
the state never is.
_Avoid_: fake viewer context, mock viewer state (the state is real by design)

**Retry** (plugin):
Manual full re-activation of a failed plugin instance, exposed to the host through the
`pluginerror` channel. Never automatic and never surfaced to the end user.
_Avoid_: re-mount (retry re-runs the whole activation, not just the UI step)

## Plugin chrome

**Panel**:
A plugin render target: a full side/bottom panel in the viewer chrome.

**Flyout**:
A plugin render target: a popover anchored to its toolbar button, auto-placed toward
the canvas. The compact alternative to a panel.
_Avoid_: popup, popover (as the term of art)

## AV domain

**Published state**:
A state object one plugin activation exposes to hosts and wrappers through viewer state,
living exactly as long as its activation. It follows the viewer-state taxonomy and the
parity rule one level down: anything the plugin's UI can do, a host can do through its
commands.
_Avoid_: plugin store, second state surface (it hangs off viewer state, not beside it)

**AVState**:
The AV plugin's published state: playback commands, notifying playback facts, and
query-only continuous time, all in canvas time on the **canvas timeline**.

**Canvas timeline**:
The single clock of a claimed canvas: the mapping between canvas time (0 to duration)
and the media segments that play it. Everything time-facing speaks canvas time; only the
sequencer knows segments.
_Avoid_: media time, element time (the segment's own clock, an implementation input)

**Segment seam**:
The moment playback crosses from one segment of a composed canvas to the next, with a
brief gap accepted. Gapless playback is deliberately not the contract.
_Avoid_: gapless transition (it is not), track change (segments are one composition,
not alternatives)

**Temporal offset**:
The media time carried by navigation — a `#t=` fragment, a `start` property, or a
content-state target. Core carries it as it carries a spatial region; only the claimant
interprets it, as a seek, never as autoplay.
_Avoid_: start time (one source of it), timestamp

**Transport**:
The playback control UI for a claimed AV canvas, rendered in the viewer's control bar
and never over the canvas. The accessible path to every playback action; canvas gestures
are enhancements over it.
_Avoid_: player chrome, native controls (the transport deliberately replaces them)

**Transport chrome**:
The media-agnostic seam a timed-media claimant registers with core — a view model of
playback facts and a port of playback commands — which core renders as the
**transport**.
_Avoid_: AV seam (it names no medium), player API

**Idle chrome**:
The control bar hiding itself while a claimed canvas plays and nothing is happening,
returning on any interaction. Never in effect while paused or while the bar holds focus.
_Avoid_: autohide (says nothing about the rules that bound it), fullscreen chrome (a
different feature)

**Stage layout**:
The claimant's allocation of its claimed canvas rect into vertical lanes in canvas
space: `video`, `audio-with-image`, or `audio`. Chosen by what core paints in the rect,
never by which element decodes the body.
_Avoid_: media layout (ambiguous with the viewer's canvas layout)

**Timeline projection**:
The linear mapping between a claimed canvas's x-axis in canvas space and media time.
What makes pan/zoom double as temporal zoom and a tap resolvable to a seek.
_Avoid_: time scale, temporal zoom (the interaction, not the mapping)

**Ruler**:
The graduations a timeline lane draws when the canvas links no waveform: round-interval
ticks with clock labels, the played span, and the playhead.
_Avoid_: timeline (the projection), scrubber (the transport's control)

**Peaks model**:
The single normalized in-memory representation of waveform data, whatever on-disk
format it arrived in. Temporal zoom sharpens only to its resolution — the waveform never
fabricates detail.
_Avoid_: waveform file (the input, not the model)

## Content state domain

**Content state**:
A portable IIIF description of a view — a bare IIIF URI, or a W3C Annotation with
`motivation: contentState` targeting a Canvas (optionally a region of it) within a
Manifest. Says _what to show_, not how it is delivered.
_Avoid_: content state URL, "the iiif-content" (both conflate the payload with its delivery)

**`iiif-content` parameter**:
The IIIF-mandated HTTP request parameter that delivers a content state — one of several
delivery channels, not the payload itself.
_Avoid_: content state param (implies it is the only channel)

**View target**:
Triiiceratops' resolved projection of a parsed content state —
`{ manifestId, canvasId?, region? }`. What the viewer consumes.
_Avoid_: content state (the spec artifact, not the parsed result)

## Site content domain

**Content document**:
One route's body and its own words (heading, rail label, lede) held as a single Uncial
document. A route either has one or is rendered from code; there is no partial case.
_Avoid_: page (the route, not its body), template (a document is content, not markup),
markdown file (the stored form is a normalized document)

**Edit variant**:
The development-only route pairing a content route with an editor in place of its body,
writing each change straight back to the document. Production builds have no such route.
_Avoid_: admin, CMS route (there is no second application), draft mode (there is no
save step and no unpublished state)

**Derived block**:
A block placed in a content document but rendered from code, with nothing editable
inside it. Either _live-data_ (renders the data it names, holding no copy) or
_script-owned_ (attributes a generator writes and a gate re-checks).
_Avoid_: component, embed (both describe rendering rather than the guarantee that its
figures cannot be hand-edited)

**Local storage backend**:
The filesystem implementation of Uncial's forge interface: content documents are read
and written in the working tree itself, and version control is the history.
_Avoid_: local mode, offline CMS (nothing is queued or synced — the working tree is the
store)

## Repository topology

**Shipped surface**:
What a published package contains: only what the viewer needs to run. Application and
test code is kept out structurally — where the build cannot reach it — rather than by
policy.
_Avoid_: dead code (a test host is live, correct code — just not the library), private
API (it is not in the package at all)

**Workspace boundary**:
The rule that `apps/*` — the site's private applications — see exactly what an external
consumer sees: a package's published entrypoints. Reaching into a package's `src` tree
is forbidden in both directions; it is what keeps app-only strings and glyphs out of the
shipped registries.
_Avoid_: demo boundary (it governs every app, and both directions), import hygiene
(suggests a preference; this is what makes the registries unreachable)

**URL contract**:
`site-urls.json` — the reviewed definition of every public URL on the site, which build
emits it, and why it exists, asserted against the built tree as a required gate.
_Avoid_: sitemap (generated crawler output; the contract is the reviewed source), route
table (nothing routes — these are paths in a static tree)

## Herd domain

**Herd**:
Several Triiiceratops viewers arranged as panes so that together they read as one
viewer, sharing one config and one theme. It coordinates viewers and owns their panes'
lifetimes, but never is one and adds nothing to core.
_Avoid_: workspace (taken by the workspace boundary), comparison (taken by a package),
multi-viewer, mosaic

**Pane**:
One slot in a herd, holding exactly one unmodified viewer.
_Avoid_: panel (a plugin render target), window, slot, frame, tile

**Pane title**:
The name shown over a pane: the host's title for that pane, otherwise the manifest's own
label. The only always-visible name a reader sees for a manifest.
_Avoid_: header (implies a bar), caption, label (the manifest's label is a source of the
title, not the title)

**Herd chrome**:
The herd's own controls — adding, closing, and arranging panes — reached from inside
each pane's toolbar but belonging to the herd, not the viewer. Dividers are herd layout,
not herd chrome.
_Avoid_: toolbar (the viewer's), herd bar

**Herd state**:
The per-herd live state object — its panes, their layout, and which pane is maximized —
and the sole host-facing contract for a herd. Each pane's viewer state is reached
through it, never merged into it.
_Avoid_: herd store, workspace state

**Herd command**:
An operation that changes a herd — adding, closing, maximizing, or resizing panes —
offered to hosts on equal terms with herd chrome (herd parity).

**Herd layout**:
The arrangement of a herd's panes as nested horizontal and vertical splits divided by
draggable dividers. Panes never overlap.
_Avoid_: grid, tiling, stage layout (an AV term)

## Relationships

- **Drawing layer → Store → Adapter**: the drawing layer calls the store for all
  persistence; the store wraps the raw adapter with display sync, stamping, and
  reconciliation.
- **Store → Overlay**: display sync feeds the read-only overlay; the drawing layer holds
  only the annotation being edited.
- **Residency tier → required set**: a canvas leaving the pyramid tier releases every
  level it held, base level included.
- **Host ↔ Plugin**: the host customizes via the extension (behavior), the body editor
  (body UI), and the adapter (storage).
- **Herd → pane → viewer**: a herd owns its panes; each pane holds one unmodified
  viewer. Herd chrome is a plugin inside each viewer.
- **Content route → content document → derived block**: a content route has exactly one
  document; a derived block is a hole in it rendered from code. The edit variant is that
  document opened for writing, wherever a local storage backend can reach the working
  tree.
- **Content state → delivery → View target**: a content state arrives through a
  delivery channel, which is the host's, and the viewer parses it into a view target.
  The one channel the viewer can own is the `iiif-content` URL parameter, off by default.
