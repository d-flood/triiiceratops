# Triiiceratops Glossary

Canonical vocabulary for the triiiceratops IIIF viewer. When code, docs, issues, or
conversation need one of these concepts, use the term defined here.

## Annotation domain

**Adapter**:
The host-supplied storage backend for annotations — a handful of pure persistence
functions (`load`/`create`/`update`/`delete`, optional `hydrate`). It stores and
retrieves; it has no display, id-bookkeeping, or stamping responsibilities.
_Avoid_: storage provider, backend, connector

**Store**:
The plugin-internal persistence layer that wraps the adapter and owns everything the
adapter must not: caching, create-vs-update resolution, display sync, id
reconciliation, stamping, and error rollback.
_Avoid_: cache (for the whole layer), repository

**Display sync**:
Making persisted annotations visible in the read-only overlay by injecting them into
the owning viewer instance's display state after each successful persistence operation.
Owned by the plugin, never by adapters. Display state is per viewer instance — never
shared across viewers on the same page.
_Avoid_: injection (alone, without saying what is injected where), shared display state

**Painting annotation**:
An annotation that places image content onto a canvas — IIIF v2 `canvas.images[]`, v3
the annotations inside `canvas.items[]` AnnotationPages. What the viewer renders as the
image. The one use of "annotation" in this glossary that does _not_ mean commentary;
everywhere else in the annotation domain, an annotation is something a user wrote.
_Avoid_: image annotation (conflates the annotation with its Image body), canvas
annotation (ambiguous — `ensureCanvasAnnotations` returns commentary), content
(Manifesto's v3 term, and a dead IIIF 3.0-beta field name)

**Manifest annotation**:
A commentary annotation defined by the manifest itself (v2 `otherContent`, v3
`canvas.annotations`), as opposed to a user annotation created through the
annotation-editor plugin. The viewer merges user annotations on top of these.
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
pyramid is addressed in. Core-internal: the canvas-space/image-space conversion happens
inside core, so image space never appears at the plugin boundary — the coordinate helpers
there convert between canvas space and screen space, and no plugin has to know an image's
pixel dimensions.
_Avoid_: pixel space, screen space (screen space is the viewport's own coordinates, a
third thing)

**Draft**:
The annotation as enriched by the host's `prepareDraft` extension hook before it is
first persisted. What the user sees in the panel and what gets saved must both be the
draft, never the raw drawn shape.

**Hydration**:
Fetching an annotation's full body on demand (typically at selection) when the adapter
returned only a skeleton from `load`.

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
Swapping the plugin's temporary annotation id for the canonical id the adapter's server
minted on create, everywhere at once (cache, display state, open editor, subsequent
calls).

**Canonical id**:
The server-assigned annotation IRI after reconciliation; the only id used for
subsequent `update`/`delete`.
_Avoid_: real id, server id (in code)

**Echo**:
The Annotorious lifecycle event re-emitted asynchronously after the plugin itself
programmatically mutates Annotorious state. Echoes are suppressed per annotation id so
they don't trigger duplicate persistence.

**Body editor**:
The UI inside the editor card that edits an annotation's bodies. Either the built-in
`{purpose, value}` editor or a host-supplied custom one; selection, deletion, and
persistence stay plugin-owned either way.
_Avoid_: annotation editor (that's the whole plugin)

**Extension**:
The host-provided hook object (`getContext`/`canCreate`/`prepareDraft`/`beforeSave`/
`onSelectionChange`/`subscribe`) through which a host application customizes plugin
behavior without forking it.
_Avoid_: plugin (that means the whole annotation-editor plugin), hooks object

## Viewer state domain

**Framework wrapper**:
A framework-native React or Vue component that hosts the Triiiceratops custom element
and translates its lifecycle, properties, and viewer state into the framework's
idioms. It does not implement or own a second viewer.
_Avoid_: framework-native viewer, adapter (reserved for annotation persistence)

**Viewer state**:
The per-viewer live state object (`ViewerState`) — the sole plugin-facing and
framework-wrapper-facing state contract. Every piece of state an integration may read,
mutate, or observe is reached through it; there is no second framework-specific state
surface.
_Avoid_: viewer store, global state

**Manifest cache**:
The page-shared cache of fetched and parsed manifests. Internal — plugins reach
manifest data only through viewer state queries and subscriptions, never by importing
the cache. Sharing it across viewers is a caching optimization, not a state contract.
_Avoid_: manifests state (as a plugin-facing concept)

**Command state**:
Viewer state a plugin may change through a supported command (mutation method).
Coverage is set by the parity rule. Readable and notifying.
_Avoid_: setter, writable property (commands maintain invariants; they are not field writes)

**Observable state**:
Viewer state that mirrors an external fact (network errors, fetch progress) — readable
and notifying, but with no supported mutator. Changed only by operations that change
the underlying fact, never by writing the value.
_Avoid_: read-only state (it changes; plugins just don't write it)

**Parity rule**:
Anything the viewer's own UI can do, a plugin can do through a supported command. The
arbiter for what must be command state.

**State inventory**:
The checked-in, reviewed table classifying every mutable viewer-state member as command
state, observable state, or internal. The capability-matrix test reads it; an
unclassified member fails CI.

**Notification**:
The batched, no-payload wake-up a viewer-state subscriber receives by the next flush
after any inventoried member changes. Means "state changed — read what you need"; it
carries no change list and collapses intermediate states. Granularity is member-level:
commands replace members or bump collections, never deep-mutate innards.
_Avoid_: event (notifications are not a transition log)

**Selector**:
The framework-neutral memoized `{ get(), subscribe() }` view of viewer state.
Recomputes only when state has changed and propagates only when its selected value
fails the equality gate. Plugin activations and framework wrappers each own an
isolated selector runtime for their viewer state.

**Selector cadence**:
Which notification wakes a selector: `state` (the default — the batched, inventoried
member watcher) or `frame` (the renderer's own animation events). Projection,
memoization, equality gating, and disposal are identical in both; only the wake-up
differs. Frame cadence is how continuous viewport values are read reactively without
mirroring them into viewer state.
_Avoid_: unbatched notification, polling (frame cadence is event-driven, not a loop)

**Query-only state**:
High-frequency (per-frame) values readable on demand but deliberately non-notifying —
e.g. continuous viewport position. Which members are query-only is an explicit state
inventory decision. Reading such values reactively is a selector cadence choice, not a
reclassification.

**Active locale**:
The locale a given viewer instance renders in: its configured locale if set, otherwise
the page default. Per viewer instance — plugin context reports the owning viewer's
active locale, and all of that viewer's chrome and plugin UI render in it.
_Avoid_: the locale, current language (ambiguous about whose)

## Renderer domain

**Scene plan**:
The planner's pure output for one frame: the layout rect per canvas, the residency tier
per canvas, the ordered tile/thumbnail/metadata requests, the eviction candidates, and
the derived zoom floor. Data in, data out — no DOM, no I/O, deterministic. The painter
consumes it and does nothing but set the transform and draw.
_Avoid_: render state, frame state (a scene plan is a value produced and discarded each
frame, not state anything holds)

**Residency tier**:
Which of three treatments a canvas receives, chosen per frame from its projected size on
screen. Orientation-invariant: the measure is the geometric mean of projected width and
height, so a portrait page in a left-to-right world and a landscape page in a
top-to-bottom world decide the same way at equal visual size.
_Avoid_: LOD, zoom level (a tier is about a canvas; a level is about a pyramid)

**Pyramid tier**:
A canvas projected large enough on screen to hold a full tile pyramid — the only tier
that fetches tiles.

**Thumbnail tier**:
A canvas holding one static image sized to its projection, with no pyramid and no tile
cache.

**Box tier**:
A canvas rendered as its layout rect only: no network, no texture.

**Required set**:
What must be resident and is never evicted while it is required — the base level and the
coarser chain for every pyramid-tier canvas, the current level for tiles intersecting
viewport-plus-margin, and the resolved thumbnail for every thumbnail-tier canvas.
_Avoid_: cache (the required set is the opposite of a cache — membership is derived from
the viewport, not from what happened to be touched recently)

**Opportunistic cache**:
The byte-budgeted LRU holding what was recently dropped from the required set. Keyed by
recency and capped in bytes rather than tile count, with separate desktop and mobile
ceilings.

**Size-ladder source**:
A level0 image service advertising only fixed sizes, with no tiling. A rung is chosen by
the same `minPixelRatio` walk a pyramid level is — the largest rung not oversampled past
that ratio, which at 0.5 can be as narrow as half the width actually needed — and capped
against a maximum decoded pixel count. Deliberately the same rule as the pyramid rather
than "the nearest advertised image at or above what is needed": one budget governs
sharpness for both source kinds, and it is how the previous renderer chose.
_Avoid_: static source (that means a canvas with no image service at all)
_Note_: a service that advertises no tiles is a size-ladder source only if it is also
level0. Level 1/2 services omit `tiles` too, and serve arbitrary regions.

**Paint hook**:
An ordered layer a plugin registers, called each frame after tiles are painted, with the
2D context and the current transform. Ordering is explicit; core uses the hook itself, so
it is exercised rather than speculative.
_See also_: **overlay layer** — the DOM counterpart. The choice between them is the
accessibility rule, not timing: anything a reader must perceive or operate is DOM in an
overlay layer, and a paint layer is decoration or a second rendering of geometry the DOM
already carries.

**Overlay layer**:
A DOM container a plugin registers, placed beside the renderer in the viewer's stage,
positioned by the plugin from the coordinate helpers and re-placed on the `frame` cadence.
Its origin is `canvasToScreen`'s origin. Created once on registration and removed once on
dispose — never remounted in between, so it survives a manifest change. Transparent to
pointer events; children opt in. Registration order only, with no ordering field. Its id is
`<pluginId>:<name>`, validated, so unregistering the plugin releases layers its own cleanup
missed — a backstop, not the documented path.
_Avoid_: overlay panel (that is a plugin **panel** rendered at the overlay position, which
is chrome)

**Viewport inset**:
Edges of the surface a plugin has reserved, in screen pixels, which **fits** frame into:
the scale comes from the inset extent and the centre is offset by half the asymmetry, so a
folio lands where the reader can see it rather than behind the plugin's own floating UI.
Fit targets only — pan, zoom, the zoom range, the coordinate helpers and the viewport
queries stay about the whole surface, because overlay-layer DOM does. Setting one does not
move the current view; the next fit uses it. One per viewer, so a second setter wins.
Negative or non-finite edges are refused at set time; an axis the window has left no room
on falls back to the full surface silently. Reserving more than **half** an axis is
unsupported: past that the reader's zoom floor and the pan constraint cut into the fit, so
the inset is honoured in direction but not in full.
_Avoid_: margin, padding (both suggest a box model rather than a fit target)

**Unsupported presentation**:
The first-class rendering of a canvas that has painting bodies core cannot display
(non-image bodies) and nothing renderable: the canvas keeps its layout rect and its
place in navigation and the thumbnail strip, and paints an honest "unsupported
content" treatment. Not an error — no retry, no negative-cache entry, no error
channel. A canvas with both image and non-image bodies paints its images and ignores
the rest silently; the unsupported presentation appears only when nothing is renderable.
_Avoid_: error placeholder (that is `CanvasErrorKind`, a load failure), broken canvas

**Canvas claim**:
A plugin taking ownership of the non-image content of one canvas in one viewer
instance. Claiming suppresses the unsupported presentation (and its thumbnail noise)
for that canvas; it changes nothing else core does — image painting bodies still render
through the normal pipeline, and layout, navigation, and coordinate projection are
untouched. One claimant per canvas; a second claim is refused. Claims are keyed to the
activation and released when it ends.
_Avoid_: canvas takeover, render veto (a claim does not stop core's image painting)

**Input claim**:
A consumer temporarily owning pointer input, suppressing pan and zoom gestures for its
duration. The gesture recogniser is built with a single arbitration point that decides
which consumer owns a gesture, which is where a claim would be granted. The term is fixed
now; the API ships in phase 2.
_Avoid_: capture (that is the DOM pointer-capture mechanism, one implementation detail of
honoring a claim)

## Plugin lifecycle

**Registration**:
A plugin factory being added to the browser runtime namespace (or passed to the viewer
in module builds). Order-independent, side-effect-free, no compatibility checking, and
never activates anything. First version of a given plugin wins; duplicates of the same
version are no-ops.
_Avoid_: loading, installing (both conflate script delivery with registration)

**Activation**:
Explicitly attaching a registered plugin to one viewer instance. This is where
compatibility (core range, plugin API range, capabilities) is negotiated and where
isolated per-viewer plugin state is created. A plugin can register successfully and
still fail activation. An activation's lifetime is keyed to the plugin's identity
within a viewer's plugin list, not to the identity of the list itself: re-supplying an
equal list leaves existing activations untouched. There is one activation path — the
framework-neutral SDK plugin (`definePlugin`). The Svelte-only `PluginDef` shortcut,
which core registered without negotiating anything, was removed for 1.0.
_Avoid_: enabling, mounting (mounting is the UI step inside a successful activation)

**Test viewer context**:
The SDK test kit's harness for plugin tests: a real compiled viewer state (real
commands, real batched notifications) assembled with recording doubles for the style,
UI, and locale services. It creates no renderer and paints nothing; renderer-dependent
behavior belongs to the browser seam, not to the kit. The harness is fake; the state is
never fake.
_Avoid_: fake viewer context, mock viewer state (the state is real by design)

**Retry** (plugin):
Manual full re-activation of a failed plugin instance: run its cleanups, drop its
subscriptions, then activate fresh. Exposed to the host through the `pluginerror`
channel's `retry()`; never surfaced to the end-user and never automatic. A plugin whose
activation fails degrades silently — logged for developers and left unsurfaced (no
toolbar button) rather than shown as a user-facing error.
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
A state object one plugin activation exposes to hosts and wrappers, reached only
through viewer state (never imported from the plugin), living exactly as long as its
activation. It follows the viewer-state taxonomy — commands, observable members,
query-only members with a cadence — and the parity rule one level down: anything the
plugin's own UI can do, a host can do through the published commands. The set of
published states is itself observable viewer state.
_Avoid_: plugin store, second state surface (it hangs off viewer state, not beside it)

**AVState**:
The AV plugin's published state: playback commands (play, pause, seek, volume),
notifying playback facts (paused, duration, buffering), and query-only continuous
time with its own cadence. All times are canvas time on the canvas timeline, never a
media element's own clock. Commands address the current canvas's media; a command
against a non-AV canvas is refused, and a browser-refused `play()` surfaces as state,
never as a thrown error.

**Canvas timeline**:
The single clock of a claimed canvas: the mapping between canvas time (0 to the
canvas's duration) and the media segment plus element-time offset that plays it. For a
canvas painted by one AV body it is the identity mapping; for a temporally composed
canvas (multiple AV bodies tiling the duration via `#t=` targets) it is the segment
map. Everything time-facing — AVState, the transport, the timeline projection,
temporal offsets, `ended` — speaks canvas time; only the sequencer knows segments.
_Avoid_: media time, element time (those are the segment's own clock, an
implementation input)

**Segment seam**:
The moment playback crosses from one segment of a composed canvas to the next: the
next element is preloaded as the boundary nears and swapped in at it, with a brief
audible/visible gap accepted and documented. Gapless (MSE-stitched) playback is
deliberately not the contract.
_Avoid_: gapless transition (it is not), track change (segments are one composition,
not alternatives)

**Temporal offset**:
The media time carried by navigation — a `#t=` fragment on a structure item, a `start`
property, or a content-state target. Core parses and carries it exactly as it carries a
spatial region; only the claimant interprets it, as a seek, never as autoplay. A range's
end time is carried but not enforced.
_Avoid_: start time (that is one source of it), timestamp

**Transport**:
The plugin-built playback control UI for a claimed AV canvas — play/pause, scrubber,
time display, volume. Anchored to the canvas it controls. The accessible path to every
playback action; canvas-surface gestures and waveform taps are enhancements over it,
never the only way.
_Avoid_: player chrome, native controls (the transport deliberately replaces them)

**Stage layout**:
The claimant's allocation of its claimed canvas rect into vertical lanes, all in canvas
space so the stack pans and zooms coherently: a visual lane (video frame or
accompanying image) and a timeline lane (waveform). Audio without an accompanying
image gives the timeline lane the whole rect; video takes the whole rect as visual
lane.
_Avoid_: media layout (ambiguous with the viewer's canvas layout)

**Timeline projection**:
The linear mapping between a claimed canvas's x-axis in canvas space and media time
(canvas width ↔ duration). What makes the viewer's own pan/zoom double as temporal
zoom, and a surface tap resolvable to a seek.
_Avoid_: time scale, temporal zoom (that is the interaction, not the mapping)

**Peaks model**:
The single normalized in-memory representation of waveform data (min/max sample
pairs, sample rate, samples-per-pixel, channels) that rendering consumes. Parsers for
the on-disk formats (audiowaveform binary `.dat`, `waveform.json`) are detected by
content, not by declared format, and normalize into it; nothing downstream knows which
format arrived. Temporal zoom sharpens only to the data's resolution — the waveform
never fabricates detail the file doesn't contain.
_Avoid_: waveform file (that is the input, not the model)

## Content state domain

**Content state**:
A portable IIIF description of a view — either a bare IIIF URI, or a JSON-LD W3C
Annotation with `motivation: contentState` whose `target` is a Canvas (optionally with
an `#xywh=` region) and whose `partOf` names the Manifest. Says _what to show_, not how
it is delivered.
_Avoid_: content state URL, "the iiif-content" (both conflate the payload with its delivery)

**`iiif-content` parameter**:
The IIIF-mandated name for the HTTP GET/POST request parameter that delivers a content
state. One of several delivery channels (also paste, drag-and-drop, FileReader, `data-*`
attribute); it is not the payload itself. Carries a base64url-encoded Annotation or a
bare URI.
_Avoid_: content state param (implies it is the only channel)

**View target**:
Triiiceratops' resolved projection of a content state after parsing —
`{ manifestId, canvasId?, region? }`. What the viewer consumes; distinct from the
incoming content state. (Currently typed `ContentStateTarget` in `contentState.ts`.)
_Avoid_: content state (that is the spec artifact, not the parsed result)

## Relationships

- **Manager → Store → Adapter**: the manager (the annotation drawing-layer mechanics)
  calls the store for all persistence; the store calls the raw adapter and performs
  display sync, stamping, and reconciliation around it.
- **Store → Overlay**: the store's display sync feeds the read-only overlay; the drawing
  layer holds only the annotation currently being edited.
- **Canvas tier → level residency**: the canvas's residency tier gates the per-canvas
  level rules. A canvas leaving the pyramid tier releases every level it held, base level
  included.
- **Host ↔ Plugin**: the host customizes via the extension (behavior), the body editor
  (body UI), and the adapter (storage).
- **Content state → delivery → View target**: a content state (the payload) arrives
  through a delivery channel (the `iiif-content` parameter, drag-and-drop, etc.), is
  parsed into a view target, and the viewer loads its manifest and frames its canvas/region.
