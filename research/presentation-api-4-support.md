# IIIF Presentation API 4.0: What Triiiceratops Would Need

> **Verdict (2026-09-11): no work needed yet.** All four published v4 Cookbook
> recipes were measured against the viewer and every one already behaves
> correctly with **no code changes**. Scope was narrowed to "support only what
> Cookbook recipes cover", which left nothing to build, so it was dropped. The
> trigger to revisit is a **newly published v4 Cookbook recipe**, not a change
> in the spec text. See _Measured behaviour_ below.

Research date: 2026-09-11. Sources are the published draft at
<https://iiif.io/api/presentation/4.0/> and its
[Data Model](https://iiif.io/api/presentation/4.0/model/), diffed against
[Presentation 3.0](https://iiif.io/api/presentation/3.0/).

## Status of the spec (correcting the premise)

v4 is **not stable**. As of today the specification's own status block reads:

- This Version: **`4.0.0-draft`**
- Latest Stable Version: **`3.0.0`**

It has graduated from `preview.iiif.io` onto the canonical `iiif.io` site, which
is real progress, but the
[roadmap](https://iiif.io/news/2025/08/11/roadmap/) targeted a release candidate
for January 2026 and a final release for the June 2026 conference, and neither
has landed in the status block.

One concrete consequence: **`http://iiif.io/api/presentation/4/context.json`
currently serves `{}`.** The JSON-LD context is an empty stub. Nobody can
round-trip a v4 document through a JSON-LD processor yet, which caps how much
real-world v4 content can exist.

**Recommendation: build v4 _tolerance_, not v4 _conformance_.** Accept v4
spellings wherever the cost is a second property name, degrade gracefully on the
resource types we will never render, and defer anything that requires committing
to draft semantics.

## The good news

The viewer never branches on the Presentation `@context`. The only `@context`
reader in the codebase is `renderer/imageService.ts`, and that is the _Image_ API
context. Everything else — `utils/iiifParsing.ts`, `utils/collections.ts`,
`utils/structures.ts` — duck-types on `type`/`@type` and property presence.

Because v4 leaves the Manifest → `items` → Canvas → AnnotationPage → Annotation →
`body`/`target` spine untouched, **a v4 manifest whose containers are all
Canvases loads and renders today with no changes at all.** The work below is
about the edges v4 adds, not about a new parse path.

The `behavior` vocabulary is also unchanged: every one of the fifteen v3 values
survives with the same meaning. v4 only rewords the descriptions to say
"Container" where v3 said "Canvas", extends `sequence` to Annotation Pages, and
extends `hidden` to Lights and Cameras. `toBehaviorList` / `getCanvasBehaviors`
need nothing.

Likewise unchanged: `timeMode`, `structures`, `start`, `supplementary`,
`navDate`, `viewingDirection`, `thumbnail`, `metadata`, `requiredStatement`,
`rights`, `provider`, `homepage`, `rendering`, `partOf`, `seeAlso`,
`service`/`services`, the language-map pattern, and the HTML-in-values rules.

## Breaking renames (must do, cheap)

| v3                   | v4                      | Where                           |
| -------------------- | ----------------------- | ------------------------------- |
| `placeholderCanvas`  | `placeholderContainer`  | `renderer/companionCanvases.ts` |
| `accompanyingCanvas` | `accompanyingContainer` | `renderer/companionCanvases.ts` |
| `"type": "Sound"`    | `"type": "Audio"`       | `plugin-av/src/sources.ts:155`  |

The content-resource type vocabulary is otherwise untouched — `Image`,
`Dataset`, `Model`, `Text`, `Video` all survive verbatim — but **audio bodies
are `Audio` in v4, not `Sound`**. The spec says so explicitly: "For
compatibility with previous versions, clients should accept `Sound` as a synonym
for `Audio`." `sources.ts` currently tests `type === 'Sound' || type ===
'dctypes:Sound'`, so a v4 audio body is recognised only by its `format` prefix
and loses the typed path entirely. The v4 `0002-mvm-audio` cookbook recipe uses
`"type": "Audio"`.

The value is now any Container subclass, not necessarily a Canvas — a Scene may
legitimately declare a Canvas placeholder, and an image-only Manifest may declare
a Timeline as its `accompanyingContainer` (that is the spec's own example, for
background audio).

Lands in `renderer/companionCanvases.ts` (`COMPANION_PROPERTIES`), with doc
ripples in `renderer/types.ts`, `state/viewer.svelte.ts` and `index.ts`. Accept
both spellings; prefer the v4 one where a document carries both, matching the
precedent `getCanvasBehaviors` already sets for `behavior` over `viewingHint`.

## New Container types

`Canvas` is now one of three subclasses of an abstract `Container`. A Manifest's
`items` may hold any mix of them.

- **`Timeline`** — duration only, no spatial extent. The v4 idiom for audio-only
  content that v3 expressed as a Canvas with `duration` and no `height`/`width`.
  This is squarely in scope for `plugin-av`.
- **`Scene`** — infinite 3D space. Out of scope, per the standing decision not to
  do 3D.

Today `getCanvasesForSequence` will hand a Scene to the renderer, which will find
no painting annotations it can resolve, render blank, and emit
`warnUnreadableCanvas`'s "yielded no painting annotations" warning — which is
misleading, because nothing is wrong with the manifest.

Decision needed: whether `getCanvasesForSequence` stays type-blind (returning all
Containers, with awareness pushed into the renderer and the AV plugin) or learns
to filter. Filtering at the parse layer is tempting but wrong — it would make a
Scene-only Manifest look empty rather than unsupported, and the thumbnail gallery
and Ranges would silently disagree with `items` about how many views exist.
Prefer: keep enumeration total, teach the renderer to emit an explicit
"unsupported container type" state, and suppress `warnUnreadableCanvas` for
Containers we have declined to render.

## Genuinely new 2D capability

These are not 3D concessions. They are features v4 adds that this viewer's
audience would actually use.

### Nesting Containers — a Canvas painted into a Canvas

v4 §Nesting Containers and Use Case 6 ("Reconstruction of a Separated Object")
allow a painting Annotation's `body` to be a **Canvas**, carrying `partOf` back
to its home Manifest, targeted at a region of the enclosing Canvas. The worked
example reconstructs a miniature that was cut out of a manuscript leaf and now
lives in a different institution, pulling both source Canvases — and, crucially,
their accumulated annotations — into one reconstructed view.

This is the most significant thing in v4 for a textual-criticism viewer, and it
is entirely 2D. It is also the most expensive: `getPaintingBody` returns the
Canvas today and `resolveCanvasImage` finds no image in it. Proper support means
resolving a nested Canvas (possibly by dereferencing an external Manifest),
planning its content, and compositing it into the parent's coordinate space.

### `backgroundColor` on a Canvas

New in v4. The renderer should paint it behind the canvas content. Small, and
directly visible.

### `spatialScale` / `temporalScale`

A `Quantity` (`quantityValue` + `unit`) asserting a real-world scale for a
Canvas's coordinate units (`m`) or its duration (`s`). `spatialScale` gives us
what a physical-scale ruler overlay needs, and gives `plugin-pdf-export` and
`plugin-image-export` a defensible basis for print sizing instead of a guess.

### `provides` on supplementing annotations

A declared accessibility role for a linked resource: `closedCaptions`,
`transcript`, `alternativeText`, `longDescription`, `highContrastAudio`,
`highContrastDisplay`, `translation`. `plugin-av` currently infers captions and
transcripts from `format` and label heuristics; `provides` replaces inference
with a declaration. Cheap, and an accessibility win.

### Collection paging

v4 adds the **`CollectionPage`** class, so a Collection now has _either_ `items`
_or_ `first`/`last`, with pages linked by `next`/`prev`, positioned by
`startIndex`, and back-referenced by `partOf`. `total` (accept `totalItems` as an
alias) carries the member count.

`utils/collections.ts` and `CollectionPanel.svelte` know only the v3 single
document shape, so **a paged v4 Collection would render as an empty
collection** — a silent wrong answer, not a visible failure. The processing model
is explicit that clients must work over the abstract membership structure rather
than the document structure. This is the one place where doing nothing is a bug
rather than a gap.

### `canonical` and `via`

Valid on any resource. `canonical` is the identity to use as an annotation
target regardless of the URI a document was retrieved from, and the spec says
clients **must not** change or delete it, and **must not** invent one. This is a
correctness constraint on `plugin-annotation-editor`, not a feature.

## Selector changes

v4 formalises selectors into the data model and adds several:
`PointSelector` (x/y/z plus `instant` for a point in time), `WktSelector`,
`AudioContentSelector`, `VisualContentSelector`, `AnimationSelector`, and
`ImageApiSelector` (region/size/rotation/quality/format/version).

Two things matter to us:

1. **`selector` is an array in v4**, ordered by publisher preference, and clients
   must pick the first one they support. `utils/resolveCanvasImage.ts:208` reads
   `resource?.selector?.type` — a singular object. A v4 document writing
   `"selector": [...]` silently loses the selection.
2. **Rotation.** v4 §Rotation of Image Resources makes `ImageApiSelector` the way
   to say "paint this image rotated 90°", explicitly including the case where
   there is no image service and the client must rotate it itself.
   `parseImageApiSelectorRegion` reads `region` only.
3. `PointSelector`'s `instant` is the v4 spelling for "start playback here", and
   appears in the `start` property's own example. Relevant to `plugin-av`.

## Annotation aggregates and styling

- Alongside `Choice`, v4 defines **`Composite`** (render all, order
  unspecified), **`List`** (render all, in order) and **`Independents`** (each
  participates separately). `isChoiceBody` / `getChoiceAlternatives` handle
  `Choice` only, so a `Composite` body currently renders nothing. Minimum viable
  behaviour: treat `Composite`/`List` as "paint all items".
- **`styleClass` + `stylesheet`** (a `CssStylesheet` resource, embedded or
  referenced) let an Annotation carry CSS for its own rendering. New in v4 and
  relevant to the annotation overlay and `plugin-annotation-editor`. Note the
  obvious injection surface before implementing.

## Explicitly out of scope

Recommend documenting these as unsupported rather than silently mishandling them:

- **Scenes and everything under them** — Models, the five Light classes, the two
  Camera classes, the three Audio Emitter classes, Transforms,
  `environmentMap`, `lookAt`, `fieldOfView`, `interactionMode`, `exclude`.
- **Activating annotations** — `motivation: activating`, the `action` vocabulary
  (`enable`/`disable`/`show`/`hide`/`reset`/`start`/…), and `scope`. The model is
  media-agnostic and could in principle drive 2D layer toggling, but it is
  authored for 3D storytelling and is the least settled part of the draft.
- **`navPlace`** — promoted from extension to core, but a map UI is a separate
  product decision, not a v4 conformance obligation.

## How stable is it, really? (evidence)

"Draft" is not uniform across the document. Gathered 2026-09-11.

### The core is frozen

The strongest single piece of evidence is the cookbook. Of 76 recipes in
`IIIF/cookbook-recipes`, exactly four have a v4 variant: `0001-mvm-image`,
`0002-mvm-audio`, `0003-mvm-video`, `0608-mvm-3d`. And
[`0001-mvm-image/v4/manifest.json`](https://github.com/IIIF/cookbook-recipes/blob/master/recipe/0001-mvm-image/v4/manifest.json)
**differs from its v3 sibling only in the `@context` URL.** Same Manifest, same
`items`, same Canvas, same AnnotationPage, same `motivation: ["painting"]`, same
`body`/`target`. The editors' own canonical example asserts that the 2D spine
did not move.

`0002-mvm-audio/v4` is the informative one for us: it swaps Canvas for
**`Timeline`**. That confirms Timeline is the intended v4 idiom for audio-only
content, and it is the one shape that would break our AV path today.

### The rest is dormant, not converging

Commit churn on the two spec source files in `IIIF/api`:

| Month        | `4.0/index.md` | `4.0/model.md` |
| ------------ | -------------: | -------------: |
| 2025-10      |             46 |             23 |
| 2025-12      |             11 |             29 |
| 2026-01      |             27 |             29 |
| 2026-02      |             32 |             34 |
| 2026-03      |             33 |             38 |
| 2026-04      |             18 |              1 |
| 2026-05      |              2 |              1 |
| 2026-06 → 09 |          **0** |          **0** |

Last commit to either file: **2026-05-20**. Nearly four months untouched.

The [Presentation 4.0 milestone](https://github.com/IIIF/api/milestone/31)
stands at **94 open / 7 closed**. Last issue activity was 2026-08-31 (a single
issue), and before that 2026-06-06. The milestone has no due date.

The roadmap's two published targets — an RC by January 2026 and a final release
at the June 2026 conference — both passed without an announcement. There is no
item on the [IIIF news feed](https://iiif.io/news/) about Presentation 4 since
the August 2025 roadmap post itself.

**The JSON-LD context was never written.** `IIIF/api` contains
`source/presentation/1/context.json`, `/2/`, and `/3/` — there is no `/4/`. The
`{}` served at `http://iiif.io/api/presentation/4/context.json` is a placeholder,
not a stub awaiting terms.

### Caveat on reading the issue count

94 open issues overstates the churn. Fifteen carry `Ready-for-Eds` (decided,
awaiting write-up) and fifteen are `editorial` wording nits. Some are pure
bookkeeping: [#2317](https://github.com/IIIF/api/issues/2317), "Rename
placeholder and accompanying to use Container not Canvas", is open with zero
comments even though the rename is already applied throughout the draft text.

The discriminating labels are `discuss` (18 open) and `normative` (13 open), and
42 of the 94 are `3d`.

### Per-feature verdict

| Feature                                          | Stability               | Evidence                                                                                                                                                                  |
| ------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest/Canvas/AnnotationPage/Annotation spine  | **Frozen**              | v4 cookbook recipe identical to v3 but for `@context`                                                                                                                     |
| `behavior` vocabulary                            | **Frozen**              | No value added or removed vs 3.0                                                                                                                                          |
| `Timeline` as the audio container                | **Settled, unratified** | In the v4 cookbook; [#2279](https://github.com/IIIF/api/issues/2279) still open                                                                                           |
| `placeholderContainer` / `accompanyingContainer` | **Settled, unratified** | Applied in text; [#2317](https://github.com/IIIF/api/issues/2317) open, uncommented                                                                                       |
| Collection paging (`CollectionPage`)             | **Settled**             | No open issue disputes the class                                                                                                                                          |
| `provides` (accessibility)                       | **Live debate**         | [#2308](https://github.com/IIIF/api/issues/2308) "Consider a `provides` property", `discuss`, still open                                                                  |
| `backgroundColor`                                | **Live debate**         | [#2244](https://github.com/IIIF/api/issues/2244) open                                                                                                                     |
| `spatialScale` / `Quantity`                      | **Live debate**         | [#2281](https://github.com/IIIF/api/issues/2281), and [#2354](https://github.com/IIIF/api/issues/2354) still calls the class `UnitValue` — it has been renamed under them |
| `ImageApiSelector` rotation                      | **Live debate**         | [#2400](https://github.com/IIIF/api/issues/2400) is the _most recently active issue in the milestone_ (2026-08-31)                                                        |
| Nested Containers / external Canvas reuse        | **Live debate**         | [#2300](https://github.com/IIIF/api/issues/2300), [#2155](https://github.com/IIIF/api/issues/2155) open since 2022                                                        |
| `fileSize`, `navPlace` in core                   | **Live debate**         | [#2358](https://github.com/IIIF/api/issues/2358), [#2242](https://github.com/IIIF/api/issues/2242)                                                                        |
| Core annotation property requirements            | **Live debate**         | [#2362](https://github.com/IIIF/api/issues/2362), [#2426](https://github.com/IIIF/api/issues/2426), [#2363](https://github.com/IIIF/api/issues/2363)                      |
| Anything 3D                                      | **Live debate**         | 42 open issues                                                                                                                                                            |

## How much work is this, actually?

Sized against the code, not estimated in the abstract.

### Tier 1 is genuinely small

Every item is a dual-read at a site that already dual-reads v2 against v3. The
pattern, the tests and the doc-comment conventions all exist:

| Change                                               | Site                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| Two `*Container` names                               | `renderer/companionCanvases.ts` (`COMPANION_PROPERTIES`)   |
| `Audio` alongside `Sound`                            | `plugin-av/src/sources.ts:155`                             |
| `selector` may be an array                           | `utils/resolveCanvasImage.ts:208`                          |
| `Timeline` where `Canvas` is accepted in Range items | `utils/structures.ts:129`, `state/manifests.svelte.ts:187` |
| `totalItems` as an alias for `total`                 | `utils/collections.ts`                                     |
| Don't warn on a Container we declined to render      | `utils/iiifParsing.ts` (`warnUnreadableCanvas`)            |

**`Timeline` costs almost nothing.** A Timeline carries `items` → AnnotationPage
→ Annotation exactly as a Canvas does, so `getPaintingAnnotations` needs no
change at all, and a v3 audio-only Canvas already has no `height`/`width`. The
only places that care are the two Range parsers above, which test
`type === 'Canvas'` and would silently drop a Timeline from the table of
contents.

The real cost here is fixtures and tests, not code — this repo carries cookbook
matrix assertions, API reports, coverage and size baselines, and changesets.
Budget a couple of days, most of it test surface.

### Tier 2 is a real feature

Collection paging is the one that isn't cheap. `parseCollection` is synchronous
and pure over a single document; paging needs an async walk of `first` → `next`
→ … with cancellation, partial rendering, and a `total`-aware UI. There is a
template — `hydrateCollectionItemThumbnails` in the same class already does
async fan-out guarded by a generation counter — but it is still multi-day.

### Tiers 3–5 are not small

Nested Containers in particular is a project of its own: resolving a Canvas
body, possibly dereferencing an external Manifest, and compositing it into the
parent's coordinate space.

### The useful coincidence

The work is small _because_ v4 barely moved the parts that are settled, and the
parts that would cost real effort are the same ones with live `discuss` issues
against them. "Do tier 1 now" and "wait on the rest" are not a compromise
between ambition and caution — they are the same reading of the evidence.

Tier 1 plus Timeline makes the viewer load every v4 cookbook recipe that exists
today except the 3D one, which is the whole of the addressable v4 corpus.

## Measured behaviour (2026-09-11)

The four v4 Cookbook manifests were resolved to concrete URIs, added to the
fixture corpus, and loaded through the real registration seam
(`ViewerState.setManifestData`, real manifest cache, no mocks). The AV media
scanner was run against the same manifests. **Nothing was changed in the
viewer.**

| Recipe           | v3 baseline row                               | v4 row                                        |
| ---------------- | --------------------------------------------- | --------------------------------------------- |
| `0001-mvm-image` | `canvases=1 withPainting=1 withoutPainting=0` | identical                                     |
| `0002-mvm-audio` | `canvases=1 withPainting=0 withoutPainting=1` | identical                                     |
| `0003-mvm-video` | `canvases=1 withPainting=0 withoutPainting=1` | identical                                     |
| `0608-mvm-3d`    | —                                             | `canvases=1 withPainting=0 withoutPainting=1` |

The AV scanner reads the v4 `Timeline` audio container as `kind: audio`,
`paintsPicture: false`, `duration: 1985.024`; the v4 video Canvas as
`kind: video`, `paintsPicture: true`, `duration: 572.034`; and the v4 `Scene`
as `null`, handing it to core's **unsupported presentation** — which is the
correct outcome for a container we decline.

The fixtures and the probe were reverted after measuring; the repository is
unchanged.

### Why it already works

- The v4 simplest-image manifest differs from its v3 sibling **only in the
  `@context` URL**.
- A `Timeline` carries `items` → AnnotationPage → Annotation exactly as a
  Canvas does, and a v3 audio-only Canvas already has no `height`/`width`.
- The AV classifier decides `kind` from `format` before the IIIF type, so
  `"type": "Audio"` with `"format": "audio/mp4"` classifies correctly despite
  the classifier not knowing the `Audio` spelling.
- The unsupported-presentation path keys on the painting **body** being
  non-image, not on the container type, so a Scene with a `Model` body degrades
  correctly without knowing what a Scene is.
- The viewer never branches on the Presentation `@context`; the only
  `@context` reader in the codebase is the Image API service detector.

### Two latent near-misses, deliberately not fixed

Recorded so they are not "fixed" speculatively, and so they are recognised if a
future recipe exposes them:

1. The AV classifier tests `Sound` and not `Audio`. Only matters for a body
   whose `format` names no medium — a streaming manifest. No v4 recipe has one.
2. A body typed `Audio` with a `video/*` format would compute `paintsPicture`
   incorrectly, because the `!sound` test no longer matches. The recipe that
   would expose this (`0014-accompanyingcanvas`) has no v4 variant.

### Known gaps at this scope

Real, and accepted rather than overlooked: a v4 Range targeting a `Timeline` is
dropped from the table of contents; `placeholderContainer` /
`accompanyingContainer` are not read; an array-valued `selector` is not read; a
paged v4 Collection would render as empty. No published v4 recipe exercises any
of them.

### What to watch

Five unmerged v4 recipe branches exist upstream:
`v4-0074-update-with-provides`, `v4-0079-using-annotations-for-captions`,
`v4-0231-transcript-meta-recipe`, `v4-0253-av-transcript-supplementing`,
`0219-caption-files-with-video-content-v4`. All five concern captions,
transcripts and the `provides` accessibility vocabulary — squarely in the A/V
wheelhouse, and the most likely thing to reopen this. Watching that set is
cheaper than watching the specification.

## Suggested sequencing

1. **Tolerance pass (small, safe now).** Dual-read the two `*Container` renames;
   accept an array-valued `selector`; accept `totalItems` as an alias for
   `total`; stop warning about Containers we have declined to render.
2. **Collection paging.** The only silent-wrong-answer in the set.
3. **Accessibility + scale.** `provides` in `plugin-av`; `backgroundColor` in the
   renderer; `spatialScale` where export needs physical size.
4. **Aggregates and rotation.** `Composite`/`List`; `ImageApiSelector` rotation.
5. **Nested Containers.** The real feature, and a project of its own. Worth
   scoping separately once the draft settles.

Revised in light of the stability evidence above: steps 1 and 2 are safe now,
because they rest on the frozen spine and on classes nobody is arguing about.
Step 3 onward each has a live `discuss` issue against it, and `spatialScale` in
particular has been renamed out from under its own issue. **Hold 3–5 until the
JSON-LD context is actually written** — that is the cheapest single signal that
the editors consider the vocabulary closed, and it costs us nothing to wait for
it.
