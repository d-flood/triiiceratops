# Manifest fixture provenance

Third-party IIIF manifests vendored for the `remove-manifesto` epic
(see `.tracker/remove-manifesto/SPEC.md`). They exist so parsing changes are
verified against real manifests in CI rather than against synthetic ones only.

The `av/` directory was added later, for the `plugin-av` epic
(see `.tracker/plugin-av/SPEC.md`), under the same rules.

**Retrieved:** 2026-08-06 (`cookbook/`, `demo/`, `vendored/`); 2026-08-13 (`av/`)
**Total:** 75 files, 0.8 MB — 59 for `remove-manifesto`, 16 for `plugin-av`

**Trimming.** The `cookbook/` and `demo/` files are the upstream response
verbatim, re-serialised with 2-space indentation for diff readability; nothing
was removed. The corpus is well under the 2 MB budget, and trimming a real
manifest risks discarding the very irregularity that makes it worth vendoring.
The `vendored/` files — from `manifesto.js`'s own corpus, 36 MB in total — do
not have that luxury and **are** trimmed to roughly five canvases, per file, as
recorded in their table below.

**These are parse fixtures.** Nothing here is rendered, and no image is fetched.
Image service URLs inside them are never dereferenced by the test suite. Several
`vendored/` manifests point at hosts that no longer exist (`beta.wdl.org`,
`v8l-webtest1.bl.uk`, even `localhost:58982`); that is fine and expected.

**Every file here is loaded by CI.** `../corpus.smoke.test.ts` discovers them by
glob and asserts each one registers and enumerates. Adding a file needs no test
edit — but a file that enumerates zero canvases fails until it is named, with a
reason, in that test's explicit list. `av/` was held out by name
(`DEFERRED_DIRS`) for exactly one ticket, while it sat in the tree ahead of the
body classifier that reads it, so that sixteen pre-classifier records were never
frozen as though they were the intended answer. `plugin-av` ticket 02 landed the
classifier, deleted the skip and re-pinned both goldens in one reviewed commit.

**The synthetic fixtures are elsewhere.** `../syntheticManifests.ts` carries the
branches no real manifest here reaches. They stay in TypeScript by design.

## Licensing

IIIF Cookbook recipes are published by the IIIF Consortium as public
documentation examples. The institutional manifests below are descriptive
metadata published at public IIIF endpoints; each carries whatever `rights`
statement its publisher set, reproduced in the table where present. They are
included solely as test input. **If any publisher objects, delete the file and
replace it with a synthetic fixture** — no test should depend on a specific
institution's manifest for coverage that a synthetic fixture could provide.

The `vendored/` files come from the test corpus of `manifesto.js` (MIT,
`LICENSE.txt` in that package), which is itself the project's outgoing
dependency. They are third-party manifests that `manifesto.js` collected from
public endpoints for the same purpose we collect them for, so the paragraph
above applies to them unchanged.

## IIIF Cookbook recipes

Source: `https://iiif.io/api/cookbook/recipe/<recipe>/<file>.json`, where `<recipe>`
is the filename up to the recipe number and slug, and `<file>` is the remainder.
Most files are `<recipe>/manifest.json`; where one recipe contributed several
fixtures the remainder is the upstream filename. For example
`0010-book-2-viewing-direction-manifest-rtl.json` came from
`https://iiif.io/api/cookbook/recipe/0010-book-2-viewing-direction/manifest-rtl.json`,
and `0033-choice.json` from
`https://iiif.io/api/cookbook/recipe/0033-choice/manifest.json`.

| File | IIIF | Type | Canvases | Size | Kept for |
| --- | --- | --- | --- | --- | --- |
| `0001-mvm-image.json` | v3 | Manifest | 1 | 1 KB | general coverage |
| `0004-canvas-size.json` | v3 | Manifest | 1 | 1 KB | general coverage |
| `0005-image-service.json` | v3 | Manifest | 1 | 2 KB | image service on painting body |
| `0006-text-language.json` | v3 | Manifest | 1 | 3 KB | language maps with multiple locales |
| `0007-string-formats.json` | v3 | Manifest | 1 | 2 KB | general coverage |
| `0008-rights.json` | v3 | Manifest | 1 | 2 KB | general coverage |
| `0009-book-1.json` | v3 | Manifest | 5 | 7 KB | general coverage |
| `0010-book-2-viewing-direction-manifest-rtl.json` | v3 | Manifest | 5 | 8 KB | v3 right-to-left viewing direction (ticket 05) |
| `0010-book-2-viewing-direction-manifest-ttb.json` | v3 | Manifest | 4 | 7 KB | v3 top-to-bottom viewing direction (ticket 05) |
| `0011-book-3-behavior-manifest-continuous.json` | v3 | Manifest | 4 | 6 KB | v3 `behavior: continuous` (ticket 05) |
| `0011-book-3-behavior-manifest-individuals.json` | v3 | Manifest | 4 | 6 KB | v3 `behavior: individuals` (ticket 05) |
| `0019-html-in-annotations.json` | v3 | Manifest | 1 | 2 KB | general coverage |
| `0021-tagging.json` | v3 | Manifest | 1 | 2 KB | general coverage |
| `0024-book-4-toc.json` | v3 | Manifest | 6 | 11 KB | v3 structures / ranges (table of contents) |
| `0027-alternative-page-order.json` | v3 | Manifest | 4 | 8 KB | v3 ranges with `behavior: sequence` — multi-sequence path |
| `0029-metadata-anywhere.json` | v3 | Manifest | 2 | 5 KB | general coverage |
| `0030-multi-volume.json` | v3 | Collection | 2 | 1 KB | Collection with child manifests |
| `0031-bound-multivolume.json` | v3 | Manifest | 6 | 11 KB | v3 nested ranges |
| `0032-collection.json` | v3 | Collection | 2 | 1 KB | Collection with child manifests |
| `0033-choice.json` | v3 | Manifest | 1 | 3 KB | v3 Choice painting body — first-class Triiiceratops API (tickets 03, 06) |
| `0035-foldouts.json` | v3 | Manifest | 9 | 12 KB | general coverage |
| `0036-composition-from-multiple-images.json` | v3 | Manifest | 1 | 3 KB | composite canvas, multiple painting annotations on one canvas |
| `0046-rendering.json` | v3 | Manifest | 5 | 8 KB | general coverage |
| `0047-homepage.json` | v3 | Manifest | 1 | 2 KB | general coverage |
| `0053-seeAlso.json` | v3 | Manifest | 5 | 8 KB | general coverage |
| `0117-add-image-thumbnail.json` | v3 | Manifest | 1 | 3 KB | explicit canvas thumbnail |
| `0118-multivalue.json` | v3 | Manifest | 1 | 2 KB | multi-valued language maps |
| `0135-annotating-point-in-canvas.json` | v3 | Manifest | 1 | 3 KB | PointSelector — point annotation |
| `0202-start-canvas.json` | v3 | Manifest | 5 | 7 KB | v3 `start` property (ticket 05) |
| `0230-navdate-navdate-collection.json` | v3 | Collection | 2 | 1 KB | Collection with navDate |
| `0234-provider.json` | v3 | Manifest | 1 | 4 KB | general coverage |
| `0261-non-rectangular-commenting.json` | v3 | Manifest | 1 | 3 KB | non-rectangular selector |
| `0266-full-canvas-annotation.json` | v3 | Manifest | 1 | 2 KB | general coverage |
| `0269-embedded-or-referenced-annotations.json` | v3 | Manifest | 1 | 2 KB | external annotation pages (manifest annotations) |
| `0283-missing-image.json` | v3 | Manifest | 4 | 5 KB | canvas with NO painting annotation — degradation case, expected partial |
| `0299-region.json` | v3 | Manifest | 1 | 2 KB | canvas region targets |

### Collection members

Child manifests referenced by the Collection fixtures above, fetched so that
collections resolve without network access.

| File | IIIF | Type | Canvases | Size | Kept for |
| --- | --- | --- | --- | --- | --- |
| `0030-multi-volume-manifest_v1.json` | v3 | Manifest | 5 | 7 KB | child manifest of a Collection fixture |
| `0030-multi-volume-manifest_v2.json` | v3 | Manifest | 5 | 7 KB | child manifest of a Collection fixture |
| `0032-collection-manifest-01.json` | v3 | Manifest | 1 | 2 KB | child manifest of a Collection fixture |
| `0032-collection-manifest-02.json` | v3 | Manifest | 1 | 2 KB | child manifest of a Collection fixture |
| `0230-navdate-navdate_map_1-manifest.json` | v3 | Manifest | 1 | 2 KB | child manifest of a Collection fixture |
| `0230-navdate-navdate_map_2-manifest.json` | v3 | Manifest | 1 | 2 KB | child manifest of a Collection fixture |

## IIIF Cookbook audiovisual recipes (`av/`)

Source: the same URL rule as the Cookbook table above — every file here came
from `https://iiif.io/api/cookbook/recipe/<recipe>/manifest.json`, and no recipe
in this set publishes more than one manifest. Same licensing as the Cookbook
recipes above, and the same byte-for-byte rule: upstream's bytes plus the
trailing newline the other vendored files carry.

**Nothing here is trimmed.** The largest is 9 KB.

### How the list was derived

The methodology is the one the published comparison documents for its recipe
counts: read the Cookbook
[support matrix](https://iiif.io/api/cookbook/recipe/matrix/), which renders 80
rows across eight categories, and deduplicate by recipe to 67 distinct ones.
The audiovisual set is the matrix's own **Audio/Visual Recipes** category (13
recipes) plus the audiovisual recipes that dedupe into another category and so
are "filed elsewhere".

The derivation was then **verified against the manifests themselves** rather
than trusted: all 67 recipe manifests were fetched and searched for `Sound` or
`Video` painting bodies. Exactly 15 carry one — the A/V category's 13, plus
`0229-behavior-ranges` (filed under Structuring Resources) and
`0489-multimedia-canvas` (filed under Annotation Recipes). All 15 are vendored
here.

This list of 15 — and the 52 image recipes it leaves — is what the recipe
catalog (`packages/cookbook/src/recipes.ts`) groups as audiovisual, and so what
the site's capability axis counts with.

**The audiovisual recipe ids** — the list tickets 16 (comparison doc) and 17
(demo picker) consume:

```
0002-mvm-audio
0003-mvm-video
0013-placeholderCanvas
0014-accompanyingcanvas
0015-start
0017-transcription-av
0026-toc-opera
0064-opera-one-canvas
0065-opera-multiple-canvases
0074-multiple-language-captions
0103-poetry-reading-annotations
0219-using-caption-file
0229-behavior-ranges
0434-choice-av
0489-multimedia-canvas
```

| File | IIIF | Type | Canvases | Size | Kept for |
| --- | --- | --- | --- | --- | --- |
| `0002-mvm-audio.json` | v3 | Manifest | 1 | 1 KB | the minimal audio canvas: `duration` and **no width or height** — the shape that vanishes from layout today |
| `0003-mvm-video.json` | v3 | Manifest | 1 | 1 KB | the minimal video canvas: width, height and duration |
| `0013-placeholderCanvas.json` | v3 | Manifest | 1 | 2 KB | `placeholderCanvas` — the poster image before playback (user story 11) |
| `0014-accompanyingcanvas.json` | v3 | Manifest | 1 | 3 KB | `accompanyingCanvas` — album art above a waveform strip (user story 10). Its body is typed `Sound` with format `video/mp4`, so type and format disagree |
| `0015-start.json` | v3 | Manifest | 1 | 2 KB | `start` as a `SpecificResource` with a `PointSelector` `t` — a temporal offset that is not a `#t=` fragment (user story 15) |
| `0017-transcription-av.json` | v3 | Manifest | 1 | 2 KB | canvas `rendering` carrying a `text/plain` transcript — a non-VTT supplementary resource the captions path must not adopt |
| `0026-toc-opera.json` | v3 | Manifest | 1 | 3 KB | `structures` whose canvas references carry `#t=` fragments — ranges as chapters (user story 14) |
| `0064-opera-one-canvas.json` | v3 | Manifest | 1 | 4 KB | **temporal composition**: two Video bodies tiling one canvas's duration through `#t=` targets, under one canvas timeline (user stories 48, 49) |
| `0065-opera-multiple-canvases.json` | v3 | Manifest | 2 | 5 KB | the same opera split across canvases — the multi-canvas counterpart to 0064 |
| `0074-multiple-language-captions.json` | v3 | Manifest | 1 | 3 KB | a supplementing annotation whose body is a **`Choice` of VTT tracks** in several languages (user story 13) |
| `0103-poetry-reading-annotations.json` | v3 | Manifest | 1 | 2 KB | commenting annotations targeting a `#t=` range on an audio canvas — time-based annotation, fenced out of this epic but must not crash |
| `0219-using-caption-file.json` | v3 | Manifest | 1 | 2 KB | the plain single-track caption shape: one supplementing annotation with a `text/vtt` body (user story 12) |
| `0229-behavior-ranges.json` | v3 | Manifest | 1 | 9 KB | ranges over one video canvas with per-range thumbnails and eight `#t=` spans — the largest structures tree in the set |
| `0434-choice-av.json` | v3 | Manifest | 1 | 3 KB | a **Choice of six audio alternatives across five formats** — alac, mpeg, flac, ogg, wav, with `audio/mpeg` appearing twice (labelled MP3 and MPEG2). Playability-driven selection, not first-item-wins, and `format` alone does not identify an alternative (user story 20) |
| `0489-multimedia-canvas.json` | v3 | Manifest | 1 | 4 KB | image and video painting one canvas together, **with `#xywh=…&t=` targets** — see below |

### Findings this vendoring settles

- **A cookbook recipe does use spatially placed A/V.**
  `0489-multimedia-canvas` targets its Video body at
  `#xywh=1000,500,5000,6000&t=11,42` on a 70399x31722 canvas, alongside an Image
  body and three `TextualBody` annotations. The SPEC fences `#xywh=`-targeted A/V
  out of v1 and says the fence "stands only while it costs no cookbook coverage" —
  it costs exactly this recipe. Whoever implements the degradation contract owes
  that a decision rather than an assumption.
- **`t=` is not always a fragment.** `0015-start` expresses its start time as a
  `SpecificResource` with a `PointSelector`, not as `#t=` on a URI. Both spellings
  reach temporal-offset navigation.
- **Every caption and annotation page in this set is embedded**, so nothing here
  needs a network fetch to enumerate.
- **Most of these DID resolve a "paintable image", and that was the bug.**
  Measured through the baseline's own seam — `getCanvasTileSources` on a real
  `ViewerState` — immediately before ticket 02's classifier landed, **11 of the
  16 read `withPainting >= 1`**: `0003`, `0013`, `0017`, `0026`, `0064`, `0065`
  (2, one per canvas), `0074`, `0219`, `0229`, `0489` and the Avalon file. Only
  `0002`, `0014`, `0015`, `0103` and `0434` read 0 — and every one of those five
  is an audio-shaped canvas declaring no `width` and no `height` (`0015`
  included, despite its `Video` body). They fell out on geometry, having no rect
  to be placed in, not because anything recognised them as time-based.

  A plain `Video` or `Sound` body was resolved as an image tile source, which is
  the SPEC's problem statement exactly: the viewer handed a video URL to the
  image pipeline and asked it to tile an MP4.

  That is why the skip existed: admitting these to the baseline first would have
  pinned eleven non-zero counts as the intended answer for time-based media.
  Ticket 02 landed the classifier and emptied `DEFERRED_DIRS` in one commit, and
  the goldens now read **`withPainting=0` on fifteen of the sixteen**. That fall
  from eleven to one, reproduced by re-measuring before the change, is the
  evidence the classifier works.

  `0489-multimedia-canvas` is the sixteenth and correctly reads
  `withPainting=1`. Its row above already notes that it carries an Image body
  (with an Image API service) alongside the Video one, and the classifier's rule
  for that shape is to paint the images and ignore the rest silently. Any OTHER
  `withPainting >= 1` appearing here would be a non-image body the classifier
  missed, not a correct result.

### The waveform-linked manifest

| File | IIIF | Type | Canvases | Size | Source URL | Kept for |
| --- | --- | --- | --- | --- | --- | --- |
| `avalon-9g54xh933-skip-transcoding-mp3.json` | v3 | Manifest | 1 | 4 KB | `https://demo.avalonmediasystem.org/media_objects/9g54xh933/manifest.json` | **real waveform linkage** from a running Avalon Media System deployment: an audio canvas whose `seeAlso` is a `Dataset` of `application/json` pointing at `master_files/<id>/waveform.json`. Also carries `behavior: auto-advance`, a `structures` tree, and a `placeholderCanvas` |

It has **no `rights` property**. The In Copyright statement
(`http://rightsstatements.org/vocab/InC/1.0/`) appears only as an HTML anchor in
a `metadata` row labelled "Rights Statement" — which is how Avalon publishes it,
and a reminder that the rights slot and the rights *claim* are not the same
place. This is Avalon's public demo instance; the media URLs carry expiring
streaming tokens, which is harmless — nothing here is dereferenced.

**The detection contract, as observed in the wild.** Two shapes exist and they
disagree about everything except the `seeAlso` slot:

| Publisher | Slot | `format` | `profile` | Payload |
| --- | --- | --- | --- | --- |
| Avalon | canvas `seeAlso` | `application/json` | *(none)* | `waveform.json` |
| British Library | canvas `seeAlso` | `application/octet-stream` | `http://waveform.prototyping.bbc.co.uk` | audiowaveform `.dat` |

Only the Avalon shape could be vendored. **The British Library's IIIF endpoint no
longer resolves** — `api-beta.bl.uk` and `api.bl.uk` do not resolve DNS at all,
following the 2023 cyber-attack on the Library — so the BL row above is recorded
from the IIIF community's own workshop documentation
(`https://training.iiif.io/iiif-bl-workshop/day-three/BL-Audio/`, which quotes
the `seeAlso` block verbatim) rather than from a manifest anyone can still fetch.
Both shapes are exercised locally instead, by
`packages/core/tests/media/manifests/av-waveform.json`, against real
`audiowaveform` output.

## Institutional manifests

From the demo picker in the viewer's demo header. **The three v2 manifests here
are the project's primary real-world v2 coverage** — before this, v2 branches
including ranges, Choice, and `viewingHint` had no fixtures at all.

| File | IIIF | Type | Canvases | Size | Source URL | Kept for |
| --- | --- | --- | --- | --- | --- | --- |
| `collections-csntm-manifest.json` | v3 | Manifest | 14 | 27 KB | `https://collections.csntm.org/image-service/iiif/artifacts/MNTGRCP40/default/manifest/` | production deployment (CSNTM) — v3, 14 canvases |
| `iiif-bodleian-e32a277e-91e2-4a6d-8ba6-cc4bad230410.json` | v2 | Manifest | 84 | 107 KB | `https://iiif.bodleian.ox.ac.uk/iiif/manifest/e32a277e-91e2-4a6d-8ba6-cc4bad230410.json` | **real-world IIIF v2**, 84 canvases — primary v2 coverage |
| `iiif-harvardartmuseums-299843.json` | v2 | Manifest | 7 | 12 KB | `https://iiif.harvardartmuseums.org/manifests/object/299843` | **real-world IIIF v2**, 7 canvases |
| `iiif-wellcomecollection-b18035723.json` | v2 | Manifest | 36 | 107 KB | `https://iiif.wellcomecollection.org/presentation/v2/b18035723` | **real-world IIIF v2**, 36 canvases — v2 with structures/ranges |
| `zavicajna-digitalna-manifest.json` | v3 | Manifest | 109 | 244 KB | `https://zavicajna.digitalna.rs/iiif/api/presentation/3/96571949-03d6-478e-ab44-a2d5ad68f935%252F00000001%252Fostalo01%252F00000071/manifest` | real-world v3, 109 canvases — largest fixture |

- `collections-csntm-manifest.json` declares rights: URL to rights/usage statement
- `iiif-wellcomecollection-b18035723.json` declares rights: http://creativecommons.org/licenses/by-nc/4.0/

## `manifesto.js`'s own corpus (`vendored/`)

Source: `manifesto.js@4.3.5`, `test/fixtures/<file>` — reached in this repo only
as a transient install artifact at
`examples/vue/node_modules/manifesto.js/test/fixtures/`. **It vanishes on a
clean install**, which is why vendoring is mandatory rather than convenient.
Each file keeps its upstream filename so the copy is traceable. License: MIT
(the `manifesto.js` package); the manifests themselves belong to the publishers
identified by their `@id`.

These are, close to by definition, the manifests that broke a IIIF parser over a
decade of maintenance. The upstream corpus is 16,133 canvases across 36 MB, so
unlike `cookbook/` and `demo/` these **are trimmed**. The "Trimmed" column below
is the whole edit; nothing else was touched. Trimming preferentially keeps the
canvases that `structures` point at, so ranges survive the cut.

| File | IIIF | Canvases | Size | Kept for | Trimmed |
| --- | --- | --- | --- | --- | --- |
| `4.json` | v2 | 1 | 1 KB | IIIF 2.1 spec fixture: a sequence with **no `@id`**, and a metadata pair holding multiple values in one language | no — already 1 canvas |
| `audio.json` | v2 + IxIF | 1 | 4 KB | **`sequences` as a bare object, not an array** — the library reads it with an indexed loop and silently gets nothing. Also carries `mediaSequences` with `elements` (IxIF), which takes priority over `sequences` | no |
| `auth-clinical.json` | v2 | 1 | 4 KB | a **level-0** image service with a `sizes` block (on the canvas thumbnail; the painting body's own service is level1), behind IIIF Auth services on both | no |
| `empty-collection.json` | v2 | 0 | 0.3 KB | a Collection declaring **no members at all** — the degradation case; named in the smoke test's expected-empty list | no |
| `horriblemurders.json` | v2 | 5 | 12 KB | v2 nested ranges through the **`ranges` spelling** as string URIs, with `viewingHint`/`viewingDirection` on the *sequence* rather than the manifest | canvases 20 → 5; ranges 10 → 4 (ranges left with no canvases and no surviving children dropped) |
| `illustrationsofchina.json` | v2 | 5 | 12 KB | a v2 manifest with **four sequences**, of which only the first embeds canvases and the other three are bare `@id`/`@type`/`label` references — the real-world multi-sequence shape | canvases 76 → 5, all in sequence 1; the three reference-only sequences untouched |
| `lunchroom-manners.json` | v3 (pre-release) | 1 | 7 KB | pre-release v3 spelling: `sequences` containing `type: "Sequence"`, canvas `content` instead of `items`, a painting body that is a **`Choice` of `Video` bodies**, and `structures` using **`members`** | no |
| `members-ranges.json` | v2 | 2 | 6 KB | **all three v2 range spellings in one manifest** — `canvases`, `members`, and `ranges` — plus `viewingHint: individuals` and `viewingDirection` at the manifest root | no |
| `qatar-right-to-left.json` | v2 | 5 | 19 KB | **v2 `viewingDirection: right-to-left`** at the manifest root, with `viewingHint: paged` | canvases 498 → 5 (730 KB → 19 KB); the single range's canvas list pruned to the 5 kept |
| `riksarkivetscblarge.json` | v2 | 5 | 16 KB | a deep v2 range hierarchy (`ranges` + `canvases`, four levels: `r0 → r0-0 → r0-1-0 → r0-1-1-*`). **No dangling references** — upstream had none, and the trim rewrote parent `ranges` lists rather than leaving broken refs behind. Nothing in this corpus covers dangling-reference tolerance | canvases 8,970 → 5 (**16.3 MB → 16 KB**); ranges 21 → 8. The ticket's named example of a fixture that "tests nothing that five canvases would not" |
| `scroll.json` | v2 | 1 | 2 KB | a manifest with **no IIIF `@context`** (shared-canvas instead), canvas `height` as a **string** rather than a number, and an Image API **1.1** service declared via `dcterms:conformsTo` | no |
| `storyofwellcome.json` | v2 + IxIF | 1 | 5 KB | `mediaSequences`/`elements` (IxIF) sitting **alongside** a normal `sequences` — the priority order the enumerators must preserve | no |

### Considered and not vendored

- The rest of the `auth-*` family (10 files). IIIF Auth is out of scope for this
  epic and `auth-clinical.json` already carries the level-0 service that made
  the family interesting.
- `book-of-remembrance.json` (3.8 MB, 1,132 ranges). Its range spellings are
  covered by `members-ranges.json` at 6 KB, with less to trim wrong.
- `presentation2-paging.json`, `pseudoalbert.json`, `herbal.json`,
  `wellcomeapocalypse.json`, `witnesstopeter.json`, `sctagracilis.json` and the
  other large v2 books. All are "v2 with structures and `viewingHint: paged`",
  which the Bodleian and Wellcome manifests in `demo/` already cover with real
  production data.
- `propertyvalues.json`. Not a manifest — a bare bag of label values.

## Known-partial fixtures

These do **not** enumerate a painting annotation for every canvas. That is
correct behavior, not breakage, and any coverage check must treat them as
expected:

- `cookbook/0283-missing-image.json` — 3 of 4 canvases have a painting
  annotation. The recipe exists to demonstrate a missing image.
- `vendored/audio.json`, `vendored/storyofwellcome.json` — IxIF: the images live
  in `mediaSequences[].elements`, not in the canvas's `images`.
- `vendored/empty-collection.json` — a Collection with no members. Enumerates
  nothing, by design, and is named as such in the smoke test.
- `vendored/illustrationsofchina.json` — of its four sequences, only the first
  embeds canvases; sequences 2-4 are bare `@id`/`@type`/`label` references and
  enumerate **zero** canvases. That is the real-world shape and is why the file
  is kept, but note that the smoke test only ever reads
  `selectedSequenceIndex = 0`, so those three empty sequences are unguarded and
  unlisted. A user-selectable sequence that enumerates nothing is exactly the
  epic's signature failure mode; ticket 07 should decide whether it degrades or
  resolves the reference.

## Refreshing

These are point-in-time copies. Upstream may change.

- `cookbook/` — re-fetch by expanding the URL rule at the head of the Cookbook
  table; each filename determines its own URL.
- `av/` — the Cookbook files follow the same rule (each is that recipe's
  `manifest.json`). Re-derive the recipe list from the support matrix before
  refreshing, not after: the point of the list is that it tracks the matrix. The
  Avalon file comes from the Source URL in its own table, and is a **pinned**
  copy — Avalon's demo instance is not a preservation service and its media
  tokens expire.
- `demo/` — re-fetch from the **Source URL** column of the institutional table.
  Those URLs were recovered from the demo picker in the viewer's demo header,
  which remains the upstream list, but the column is authoritative here so the
  provenance survives the picker being edited.
- `vendored/` — copy again from
  `examples/vue/node_modules/manifesto.js/test/fixtures/<file>` after an install,
  then re-apply the trim recorded in the table. Do not "refresh" these on a
  schedule: they are pinned inputs, and the whole point of vendoring was that
  the source disappears.
