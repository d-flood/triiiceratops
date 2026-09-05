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
member watcher) or `frame` (the source's own finer-grained notification — the
renderer's animation events for viewer state, the plugin's own tick for published
state). Projection, memoization, equality gating, and disposal are identical in both;
only the wake-up differs. Frame cadence is how continuous values are read reactively
without mirroring them into the notifying state they would otherwise flood.
_Avoid_: unbatched notification, polling (frame cadence is event-driven, not a loop)

**Query-only state**:
High-frequency (per-frame) values readable on demand but deliberately non-notifying —
e.g. continuous viewport position. Which members are query-only is an explicit state
inventory decision. Reading such values reactively is a selector cadence choice, not a
reclassification.

**Active locale**:
The locale a given viewer instance renders in: the language its own picker chose if the
user chose one, otherwise its configured locale, otherwise the page default. Per viewer
instance — plugin context reports the owning viewer's active locale, and that viewer's
chrome and plugin UI render in it. It is a _content_ locale, ranging over whatever
languages a manifest is authored in; a message catalog that has no entry for it (core's
chrome, a plugin's) falls back rather than rendering in the wrong language.
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
the scale comes from the inset extent and the center is offset by half the asymmetry, so a
folio lands where the reader can see it rather than behind the plugin's own floating UI.
Fit targets only — pan, zoom, the zoom range, the coordinate helpers and the viewport
queries stay about the whole surface, because overlay-layer DOM does. Setting one does not
move the current view; the next fit uses it. One per viewer, so a second setter wins.
Negative or non-finite edges are refused at set time; an axis the window has left no room
on falls back to the full surface silently. Reserving more than **half** an axis is
unsupported: past that the reader's zoom floor and the pan constraint cut into the fit, so
the inset is honored in direction but not in full.
_Avoid_: margin, padding (both suggest a box model rather than a fit target)

**Docked chrome**:
Chrome core has docked beside the viewer that takes width or height from it: a side
panel column, the toolbar docked as a rail, a top or bottom gallery band. A plugin
flyout and an expanded gallery are not docked chrome — they float over the viewer and
take no extent from it — and neither is a window resize, which core did not cause. The
distinction is _why_ the surface changed, not that it did, and it is what selects
between **surface compensation** and the preserve-scale response to a resize.
_Avoid_: sidebar, panel (either names one member and misses the rail and the band),
overlay chrome (that is the floating kind, which is the opposite)

**Surface compensation**:
What the renderer does when **docked chrome** takes surface away or gives it back: it
preserves the canvas-space extent visible on the axis that changed, bounded by the whole
canvas, and leaves the center alone. One new scale, `scale * min(next / previous)` over the
changed axes only, floored at the smaller of the reader's scale and the fit of the
arriving surface, and — for a reader at or under the fit of the DEPARTING surface —
capped at the fit of the arriving one. The floor is a lower bound on the result, not a
promise about where a reader ends up: narrowing a surface leaves a reader who was already
below the arriving fit exactly where they were. The two fits are named separately because
gating on the wrong one is the easy mistake, and the reason this rule takes both as
arguments: gating the cap on the ARRIVING fit would drag a genuinely zoomed-in reader
down to it whenever the surface widens. The center needs no adjustment
because it is a canvas-space point; it goes through the usual pan constraint and nothing
more. The ratio is relative, so it composes exactly across a slide's frames: twelve
intermediate widths land where one jump to the final width lands, which is what makes a
full animation, a coalesced observer callback and reduced motion's single step all agree.
Two invariants hold, and are tested as properties rather than spot-checked: **no overhang
is introduced** — a reader at or under the fit of the departing surface is at or under the
fit of the arriving one, which is the guarantee the old absolute re-fit existed to provide
— and **a single-axis change is exactly invertible** while the floor is inactive, so
opening a panel and closing it returns the reader's scale and repeated toggling does not
drift them outward.
_Avoid_: re-fit, refit (the rule it replaced, and the thing it exists not to do),
`compensateForReflow` (reflow compensation, a different operation: it holds a reader's
place across a change to the world's LAYOUT, and it does move the center)
_Note_: five residuals are accepted rather than fixed. A simultaneous change on BOTH axes
is not exactly invertible, because `min` over two ratios need not pick the same axis as
`min` over their reciprocals; nothing crops either way and the round trip can only end at
or below where it started. The center's constraint is lossy on a widening surface, so the
round trip is exact in scale but not always in center for a reader parked hard against a
pan limit. A reader parked at the zoom floor is still moved by the floor, which is derived
from the live fit scale and so moves when the surface does. A reader BELOW the fit is
ratcheted up to it by repeated toggling: the floor pins each narrowing to a no-op while the
cap lets each widening apply the whole ratio, so from half the fit a portrait canvas walks
0.5, 0.5, 0.8, 1.0 of the fit and stays there — bounded, terminating at the fit, and
inward at every step, so neither invariant is touched. And the backing store is still
reallocated on every frame of a slide, because the surface CSS box genuinely changes size.

**World refit**:
The renderer framing its world afresh: it resolves a fit target and writes an absolute
scale and center, discarding whatever view the reader had. It is a response to a change of
**world** — a different manifest, viewing mode, reading direction, scale policy, current
canvas, or a layout whose rects moved — and to nothing else. What it costs is why that
list is short: a refit overwrites the reader's scale and center, so anything that can
trigger one is a thing that can move the reader. A change of _state_ is not a change of
world. Opening a panel, docking a band, toggling the toolbar, or a host replacing its
configuration object leave the framed world exactly where it was; the surface some of them
take is answered by **surface compensation** instead. The renderer remembers what it last
fitted — not one key but three reads, since the current canvas reaches it as the tile
sources' identity rather than as a member — and returns without fitting when none of them
moved, so a stray dependency on the effect that calls it costs a wasted call rather than
the reader's place — that guard is the backstop, and member-level notification (ADR 0008)
is what keeps such runs rare in the first place.
_Avoid_: reset, snap back (the symptom of an unwanted refit, not the operation), refresh
(suggests repainting, which a refit is not)

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
for that canvas; on its own it changes nothing else core does — image painting bodies
still render through the normal pipeline, and layout, navigation, and coordinate
projection are untouched. What a claim adds is eligibility: only a claimed canvas can
be given a **companion phase**, and only its claimant can set one. One claimant per
canvas; a second claim is refused. Claims are keyed to the activation and released when
it ends.
_Avoid_: canvas takeover, render veto (a claim does not stop core's image painting)

**Companion phase**:
Which companion Canvas — `placeholderCanvas` or `accompanyingCanvas` — core paints for a
claimed canvas right now: `'none' | 'placeholder' | 'accompanying'`. Set only by that
canvas's claimant, and released with the claim. Core reads both companions itself and
paints the chosen one through the ordinary image pipeline, so a companion deep-zooms and
pans like any other canvas; the claimant's only contribution is _timing_, because knowing
that playback has started is the one thing core cannot know. An **absent** phase is not
`'none'`: absent passes the descriptor through untouched, while an explicit `'none'` keeps
the adopted companion rect and paints nothing into it — so no phase transition ever
reflows the page. Geometry is decided once, from the companion that resolved to something
requestable, and never by the phase.
_Avoid_: painted companion (nothing is handed over — core resolves the Canvas itself),
companion payload (the seam deliberately carries no resource, only an enum)

**Input claim**:
A consumer temporarily owning pointer input, suppressing pan and zoom gestures for its
duration. The gesture recognizer is built with a single arbitration point that decides
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
published states is itself an inventoried, notifying member of viewer state, classified
`command` because publishing and retiring go through a supported mutator — the same
classification the other plugin-registration members carry.
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
The playback control UI for a claimed AV canvas — play/pause, scrubber, time display,
volume, alternative text tracks. Rendered in the viewer's control bar beside the canvas
navigation, driven by the claimant's published playback contract, and never drawn over
the canvas it controls. The accessible path to every playback action; canvas-surface
gestures and waveform taps are enhancements over it, never the only way.
_Avoid_: player chrome, native controls (the transport deliberately replaces them)

**Transport chrome**:
The media-agnostic seam a claimant of timed media registers with core: a view model of
playback facts (paused, position, buffered, tracks) and a port of playback commands
(toggle, seek, set muted/volume/track), plus the icons and strings the claimant owns.
Core renders it with its own primitives in the control bar; core learns only about a
thing that plays, pauses, seeks and may offer alternative text tracks. Distinct from
**Transport**, which is the reader-facing result, and from **Published state**, which is
the host-facing contract the view model is derived from.
_Avoid_: AV seam (it names no medium), player API

**Idle chrome**:
The control bar hiding itself while a claimed canvas plays and nothing is happening, and
returning on any interaction — a pointer move, a key, focus arriving, or a pause. Scoped
to manifests with claimed time-based media: with no transport chrome registered there is
no timer and no listeners. Never in effect while playback is paused or while the bar
holds keyboard focus, and hidden means transparent and non-interactive rather than absent
from the accessibility tree.
_Avoid_: autohide (accurate but says nothing about the two rules that bound it),
fullscreen chrome (a different feature this viewer does not have)

**Stage layout**:
The claimant's allocation of its claimed canvas rect into vertical lanes, all in canvas
space so the stack pans and zooms coherently. Chosen by **what core paints in the rect**,
never by which element decodes the body: `video` — the picture is the media element, so
the visual lane fills the rect; `audio-with-image` — core paints a companion Canvas there,
so the plugin draws no lanes at all and contributes only a tap target, the play-state
glyph and the "can't play" notice; `audio` — nothing to look at either way, so the
timeline lane fills the rect and carries the waveform. A stage's layout can change once,
at first play: a duration-only canvas whose only companion is a `placeholderCanvas` takes
`audio-with-image` before play and falls to `audio` on the handover, keeping the
companion's aspect throughout so the rect does not move.
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

## Site content domain

**Content document**:
One route's body and its own words held as a single Uncial document in normalized
JSON — the page's heading, its rail label and its lede among them, so the most-read
prose on a page is content rather than code. A route either has one or is rendered
from code; there is no partial case.
_Avoid_: page (that is the route, not its body), template (a document is content, not
the markup around it), markdown file (the stored form is a normalized document, not
prose markup)

**Edit variant**:
The development-only editing route paired with a content route: the same page in the
same layout with the editor standing where the body would be, writing each change
straight back to the document it is showing. A production build has no such route and
carries no editor.
_Avoid_: admin, CMS route (there is no second application), draft mode (there is no
save step and no unpublished state)

**Derived block**:
A block placed in a content document but rendered from code, with nothing editable
inside it. Two kinds, and the distinction is load bearing: a _live-data_ block carries
no attributes and renders the data it names directly, so the document holds no copy to
drift from it; a _script-owned_ block carries attributes a generator writes and a gate
re-checks, and is read-only in the editor for that reason.
_Avoid_: component, embed (both describe how it renders rather than what it guarantees:
that the figures it shows cannot be hand-edited)

**Local storage backend**:
The filesystem implementation of Uncial's forge interface: content documents are read
and written in the working tree itself, with no hosting provider, no authentication and
no commit step. Version control is the history and the undo.
_Avoid_: local mode, offline CMS (nothing is queued or synced later — the working tree
is the store)

## Repository topology

**Shipped surface**:
What a published package contains: only what the viewer strictly needs in order to
run. Everything that exists for the playground or for a test is kept out
_structurally_ — it lives where the build cannot reach it — rather than by a policy
asking authors to remember. Four mechanisms hold that line.
`packages/core/src/packaging/pruneDist.ts` trims what `svelte-package` copied wholesale:
`src/lib/test/**`, every `*.test.*` and `*.spec.*`, every `__golden__` directory
wherever it sits, and every `*TestHost.svelte` — matched by SUFFIX rather than by an
enumerated list, so the next one written is pruned without editing anything.
`test-consumers/driver/assert-tarball-contents.mjs` then asserts
the contents of the packed tarball itself rather than of `dist/`. The **workspace
boundary** keeps application code out of the packages entirely. And `packages/cookbook`
is the fourth: reference data several consumers need is held in its own package,
outside core, rather than exported from it. That last one is the standing hazard the
structure exists to prevent — a recipe catalog reads like library data, and at
`packages/core/src/lib/cookbook/` no prune rule covers it, so every build copies it
into `dist/`, and a public `./cookbook` export then makes the accident permanent API.
Nothing else in the repository reports it.
_Avoid_: dead code (a test host is live, correct code — it is simply not the library),
private API (the point is that it is not in the package at all)

**Workspace boundary**:
The rule that `apps/*` — the site's applications, private and never published — may
see exactly what an external consumer sees: a package's published entrypoints.
Reaching into a package's `src` tree is forbidden in BOTH directions, and each
direction is spelled twice: `no-restricted-imports` for static imports, and
`no-restricted-syntax` for `import()`, which `no-restricted-imports` does not inspect.
It is implemented in `eslint.boundaries.js` and called from the root
`eslint.config.js` with an unanchored `**/src/**` glob plus `apps/**`, and re-declared
from each app's own `eslint.config.js` because a root-anchored `apps/**` glob matches
nothing when ESLint runs from inside the app. The unanchored spelling is what lets one
declaration police all ten packages: each of them runs `eslint .` from its own
directory, where a root-anchored glob matches nothing at all — which is how a boundary
rule can end up policing only the single package it was written from.

Why it exists. The playground used to live inside the library, at
`packages/core/src/demo`, importing core's source directly. Three separate times,
demo-only chrome was written inside `src/lib` and its strings and glyphs enrolled in
the shared registries — core's inlang message set and the generated icon manifest.
Both are indexed by a runtime string (`createLocalizedMessages`' Proxy,
`icons[weight]?.[name]`), so no bundler can tree-shake them: every demo-only key and
glyph became bytes in the shipped element artifact. The per-directory rules that
policed those registries are gone, because the registries are no longer reachable from
an application at all — and a lint rule guarding an unreachable path teaches a future
reader that the boundary is softer than it is. This rule is what makes them
unreachable, and that history is the reason it may not be relaxed.
_Avoid_: demo boundary (it governs every app, and both directions), import hygiene
(suggests a preference; this is what makes the registries unreachable)

**URL contract**:
`site-urls.json` — the definition of the site's public paths. It records every
published URL, which build emits it, and the reason it exists, and
`scripts/url-contract.mjs` (`pnpm urls:check`) asserts it against the built tree as a
required gate.
Adding, moving or retiring a public URL is an edit to that file, reviewed as such —
including the case of a path that keeps its URL while serving different content, whose
reason is recorded there rather than repeated here.
_Avoid_: sitemap (generated output listing a subset for crawlers; the contract is the
reviewed source), route table (nothing routes — these are paths in a static tree)

**Vendored workspace**:
Uncial, at `vendor/uncial`, is at once a member of this workspace
(`vendor/uncial/packages/*`) and a complete pnpm workspace of its own, carrying its own
`pnpm-workspace.yaml` and its own lockfile. Membership is what resolves the `workspace:*`
links to it, and what makes `pnpm install` fail outright when the submodule is not
checked out. The second workspace is what makes it a hazard: a pnpm command whose cwd is
inside `vendor/uncial` resolves against Uncial's root rather than this one and installs
from Uncial's lockfile, which honors none of the `overrides` here — chiefly
`uncial-cms>vite: ^6.0.0`, the pin that keeps the `Plugin` returned by
`createLocalVitePlugin` the same type the site's `vite.config.ts` is written against. The
`vendor/uncial/node_modules` that leaves behind shadows resolution for the whole tree,
and reports itself two steps away as svelte-check errors in `apps/site` naming a `Plugin`
mismatch rather than the store that caused it. `scripts/assert-no-nested-store.mjs` gates
`pnpm check` and `pnpm test` on its absence.
Upstream work never needs to `cd` in there: `pnpm check:uncial` and `pnpm test:uncial`
run the submodule's own suites through this workspace's store. Note what that verifies —
Uncial under the Vite this repository builds it with, not the Vite 7 its own CI uses.
The store at `vendor/uncial` itself is the mistake; the root install provisions each
member at `vendor/uncial/packages/*/node_modules`, which is ordinary — but a nested
install repoints those members at its own store, so recovery deletes them along with it.
Deleting the store alone leaves them dangling, and the lockfile is already satisfied, so
the reinstall relinks nothing and the dev server serves a 500 from inside Uncial's source.
_Avoid_: nested install, submodule node_modules (both name the symptom, where the cause
is that the submodule is a workspace root in its own right)

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
- **Content route → content document → derived block**: a route declared as content has
  exactly one document, which holds its body and its own words; a derived block inside
  that document is a hole the document does not fill, rendered from code so that what it
  shows cannot be hand-edited. The **edit variant** is that same document opened for
  writing, and exists only where a **local storage backend** can reach the working tree.
- **Content state → delivery → View target**: a content state (the payload) arrives
  through a delivery channel, and the channel is the host's. The viewer ships no
  channel of its own — but it accepts the payload directly on the `content-state`
  input, and it can be handed ONE channel: `read-content-state-from-url` (off by
  default) delegates the `iiif-content` parameter to the viewer, read once on mount.
  Anything else — a drop handler, a paste, a `FileReader` — the host reads itself,
  parses with `parseContentState`, and drives through
  `manifestId`/`canvasId`/`initialCanvasRegion`. Those discrete inputs outrank
  `content-state`, which outranks the URL parameter (ADR 0006).
