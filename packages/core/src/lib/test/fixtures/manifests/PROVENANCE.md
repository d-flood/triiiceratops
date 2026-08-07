# Manifest fixture provenance

Third-party IIIF manifests vendored for the `remove-manifesto` epic
(see `.tracker/remove-manifesto/SPEC.md`). They exist so parsing changes are
verified against real manifests in CI rather than against synthetic ones only.

**Retrieved:** 2026-08-06
**Total:** 59 files, 0.8 MB

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
reason, in that test's explicit list.

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
- `demo/` — re-fetch from the **Source URL** column of the institutional table.
  Those URLs were recovered from the demo picker in the viewer's demo header,
  which remains the upstream list, but the column is authoritative here so the
  provenance survives the picker being edited.
- `vendored/` — copy again from
  `examples/vue/node_modules/manifesto.js/test/fixtures/<file>` after an install,
  then re-apply the trim recorded in the table. Do not "refresh" these on a
  schedule: they are pinned inputs, and the whole point of vendoring was that
  the source disappears.
