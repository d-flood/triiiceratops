---
search:
  exclude: true
icon: lucide/feather
description: "How large Triiiceratops is on the wire — raw, gzip and Brotli — measured against Mirador, Clover, Universal Viewer, TIFY, Canvas Panel, Diva.js and Glycerine, with and without the audiovisual plugin."
---

# Bundle size

Triiiceratops is the smallest IIIF viewer measured — on raw bytes, gzip and
Brotli at once — as a self-contained single file with no code splitting. Each
row below is the viewer code a browser transfers for an ordinary IIIF image
session, not just a package's entry file. But not all viewers have equal
capability, so there are **two Triiiceratops rows** and they answer different
questions. The first is core alone — what a site whose collection is images
transfers. The second is core plus `@triiiceratops/plugin-av`, the like-for-like
figure against a viewer that plays audio and video; TIFY, the nearest row by
bytes, is one. [Which figure applies to
you](#audiovisual-support-and-what-it-costs) depends on whether your manifests
carry time-based media.

<div class="tri-chart" aria-hidden="true"><div class="tri-chart-row"><span class="tri-chart-label tri-chart-label--self">Triiiceratops</span><span class="tri-chart-value">111.6 KB</span><span class="tri-chart-track"><span class="tri-chart-fill tri-chart-fill--self" style="width: 15.6%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label tri-chart-label--self">Triiiceratops + AV</span><span class="tri-chart-value">126.6 KB</span><span class="tri-chart-track"><span class="tri-chart-fill tri-chart-fill--self" style="width: 17.7%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">TIFY</span><span class="tri-chart-value">141.5 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 19.8%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Diva.js</span><span class="tri-chart-value">173.8 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 24.3%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Canvas Panel</span><span class="tri-chart-value">180.8 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 25.3%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Glycerine</span><span class="tri-chart-value">339.9 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 47.6%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Universal Viewer</span><span class="tri-chart-value">513.5 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 71.9%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Clover IIIF</span><span class="tri-chart-value">623.8 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 87.4%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Mirador</span><span class="tri-chart-value">713.9 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 100.0%"></span></span></div></div>

/// caption
gzip transfer size, in KB of 1000 bytes. Shorter is better.
///

| Viewer | Version | Raw | gzip | Brotli | vs. Triiiceratops core |
| --- | --- | ---: | ---: | ---: | ---: |
| **Triiiceratops** | 1.0.0-rc.36 | **380,394** | **111,601** | **93,418** | — |
| **Triiiceratops + `plugin-av`** | + 1.0.0-rc.0 | **420,008** | **126,640** | **106,844** | 1.13× |
| TIFY | 0.35.0 | 541,485 | 141,467 | 119,874 | 1.27× |
| Diva.js | 7.4.0 | 643,863 | 173,784 | 144,601 | 1.56× |
| Canvas Panel | 1.0.74 | 604,070 | 180,757 | 140,948 | 1.62× |
| Glycerine Viewer | 2.1.0 | 1,118,864 | 339,905 | 286,755 | 3.05× |
| Universal Viewer | 4.4.2 | 1,831,630 | 513,473 | 358,120 | 4.60× |
| Clover IIIF | 3.12.0 | 2,129,446 | 623,761 | 517,691 | 5.59× |
| Mirador | 4.1.0 | 2,430,874 | 713,937 | 558,083 | 6.40× |

All three size columns are bytes; the "vs." column is gzip bytes as a multiple of
Triiiceratops **core**, and the chart above plots that same gzip column.

The audiovisual pair beats TIFY on all three columns, and on gzip it beats it by
**14,827 bytes — 10.48%**. That is 11.7% of the pair, and just under the AV
plugin's own 15,039 gzip bytes: the whole audiovisual capability all but fits
inside the lead. The margin was 5,106 bytes until a reduction pass over both
artifacts in August 2026, so it is headroom that was worked for rather than a
property of the design, and the project keeps treating it as
[a standing budget](#audiovisual-support-and-what-it-costs). On raw bytes the
margin is far wider (121,477); on Brotli it is 13,030, a little narrower than on
gzip. Both sides are summed from separately compressed files, because the pair is
two responses and TIFY is two as well.

For scale: OpenSeadragon 6.1.0 is 87,297 gzip bytes as a bare tile renderer with
no manifest handling, navigation, metadata, search or localization. Triiiceratops
is a complete viewer for 1.28× that. Canvas Panel, which likewise renders
canvases rather than providing a full viewer, is 1.62× ours.

## How much of IIIF each one implements

Bytes only mean something next to capability. A rough proxy is how many of the
IIIF Cookbook recipes each viewer is recorded as fully supporting in the
[official support matrix](https://iiif.io/api/cookbook/recipe/matrix/), in the
same row order as above.

| Viewer | Image recipes, of 52 | All recipes, of 67 |
| --- | ---: | ---: |
| **Triiiceratops** | **34** | 34 |
| **Triiiceratops + `plugin-av`** | **34** | **46** |
| TIFY | 26 (+3 partial) | 31 (+3 partial) |
| Diva.js | not listed | not listed |
| Canvas Panel | not listed | not listed |
| Glycerine Viewer | 29 | 31 |
| Universal Viewer | 15 (+1 partial) | 21 (+1 partial) |
| Clover IIIF | 12 (+1 partial) | 18 (+1 partial) |
| Mirador | 28 (+3 partial) | 31 (+3 partial) |

**The image column is the like-for-like one** for the core-alone byte row, and
Triiiceratops leads it — by a margin that holds even if every other viewer's
partials are counted as full. It excludes the 15 audiovisual recipes so that it
matches what that byte row measures: Universal Viewer code-splits, so its size
row is only the chunks an image session fetched, with 1.38 MiB of AV chunks left
unloaded. Counting AV recipes there would credit capability whose bytes were
deliberately not counted.

**The all-recipes column is what each project supports in total**, and the gap
between the two columns is exactly the audiovisual work a viewer does. The
self-contained viewers ship their AV code whether a session uses it or not, so
for TIFY, Glycerine, Clover and Mirador that gap is weight already inside their
byte figures. Triiiceratops' gap is not: core alone has two identical columns
because it is an image viewer, and the audiovisual column is bought separately,
by registering a plugin, at the byte cost the second Triiiceratops row states.
The section below is what that plugin actually does with the 15 recipes.

**Canvas Panel's "not listed" is a category, not a failure**, and it is the most
interesting row here. The matrix only admits clients with a public, linkable
viewer instance, which a component library does not have. Canvas Panel is one: its
published package depends on `@iiif/vault`, `@iiif/presentation-2`,
`@iiif/presentation-3`, `@atlas-viewer/atlas` and Preact — a complete
manifest-parsing and tile-rendering stack — but exposes it as canvas-rendering
custom elements for building a viewer rather than as a viewer. So it pays for a
full IIIF stack in its 604,070 bytes, 1.62× our gzip, while leaving navigation,
metadata, search and the rest of the interface to whoever embeds it. Diva.js
supports Presentation API v2 and v3 by its own README and would qualify; it
simply has no column.

## Audiovisual support, and what it costs

Audio and video are not in core. They are `@triiiceratops/plugin-av`, a separate
package a host registers like any other plugin, and the architecture is what
keeps the second Triiiceratops row as close to the first as it is.

**Core grew by four small, media-agnostic seams**, and by nothing else. It
classifies painting bodies so a video URL never enters the image pipeline; it
lets a plugin *claim* a canvas's non-image content; it paints a claimed canvas's
`placeholderCanvas` or `accompanyingCanvas` — ordinary Presentation 3 Canvases —
through the tile pipeline it paints every other canvas with, on a three-valued
phase the claimant sets purely to say *when*; and it lets a plugin publish a
state object hosts command it through. None of that is audiovisual code; a future
3D or advanced-audio plugin uses the same seams. A viewer with no AV plugin
registered still behaves correctly on an AV manifest: the canvas keeps its place
in layout, navigation and the thumbnail strip and shows an honest "this viewer
cannot display this" placard, rather than a broken image tile.

**The heavy parts are chunks nobody fetches by default.** Four modules are split
out of the plugin's entry in *both* build formats — the ESM build emits them as
real chunks a consumer's bundler re-splits, and the IIFE, which cannot code-split
at all, ships them as sibling ES modules the entry `import()`s from its own dist
directory. None of them is in the 15,039 gzip above:

| Chunk | gzip | Fetched when |
| --- | ---: | --- |
| `dist/av-hls.js` (hls.js) | 223,530 | an HLS stream must play on a browser with no native HLS |
| `dist/av-waveform.js` | 2,584 | a canvas links audiowaveform data |
| `dist/av-sequencer.js` | 2,094 | one canvas is painted by several media files tiling its duration |
| `dist/av-transcript.js` | 2,773 | the current canvas has a caption track that loaded with cues in it |

hls.js alone is nearly twice the whole viewer. That is exactly why it is a chunk:
a manifest of MP4s never pays for it. This is the same code-splitting argument
the table above credits Universal Viewer for, with the difference that the split
here is the *optional* half rather than the baseline.

**The plugin does not ship a second Svelte runtime.** Every other first-party
plugin bundles its own; this one consumes core's, through a curated list of 11
`svelte/internal/client` helpers core exposes on its `window.Triiiceratops`
namespace. Measured on this repository, that is worth about 11.7 KB gzip on the
plugin and costs core nothing, because core's own graph already reaches every
helper on the list — curation is the whole mechanism, and re-exporting the
namespace wholesale was measured at +8,837 gzip on core. It is deliberately a
**first-party-only** arrangement: `svelte/internal` is private, unversioned API,
and the guarantee behind sharing it is that core and this plugin are built and
released from one repository at one Svelte version, which is why the plugin pins
`coreRange` to an exact core version and third-party authors are told to bundle.

The pair is a **standing size budget**, not a measurement taken once for this
page: `pnpm size:check:pair` fails the build if core's element IIFE plus the
plugin's IIFE exceeds TIFY's 141,467 gzip. With 14,827 bytes of headroom that
gate is no longer the binding constraint it was at 5,106, but it is not
re-recorded to make room — once the headroom is spent, the only way to add eager
bytes is to remove some.

### The audiovisual Cookbook recipes, one by one

All 15 are in the
[public demo's](https://d-flood.github.io/triiiceratops/viewer/) manifest picker under
"Audio & Video", and `av-cookbook.spec.ts` drives that demo against every one of
them: for the fourteen media recipes it asserts a claimed AV stage with a live
media element and a visible transport, and for all fifteen — `0489` included —
zero unsupported-content and zero error placards. On top of that it plays 0002,
0003 and 0219 end to end through the transport, checks 0219's caption toggle and
its transcript panel (including a cue click seeking without starting playback),
and asserts 0489's degradation warning and painted image body.

The rest of the "Result" column is proved by the wider AV spec suite rather than
that one file — `av-structures.spec.ts` for `0015`, `0026`, `0065` and `0229`,
`av-captions.spec.ts` for `0074`, `av-audio.spec.ts` for `0013`,
`av-composed.spec.ts` for `0064` — and several of those specs assert the
behaviour on a synthetic fixture built for the case rather than on the recipe
manifest itself. Nothing in this table is an aspiration, but the strength of the
evidence is not uniform, and where a row's claim is narrower than it reads the
row says so.

| Recipe | What it demonstrates | Result |
| --- | --- | --- |
| `0002-mvm-audio` | the minimal audio canvas (duration, no width/height) | plays |
| `0003-mvm-video` | the minimal video canvas | plays |
| `0013-placeholderCanvas` | `placeholderCanvas` as the picture before playback | plays; the placeholder is painted by core as a Canvas, so it deep-zooms |
| `0014-accompanyingcanvas` | `accompanyingCanvas` — a score alongside the recording | plays; the companion fills the rect and deep-zooms to its image service |
| `0015-start` | `start` as a `PointSelector` time offset | plays, positioned |
| `0017-transcription-av` | a `text/plain` transcript on canvas `rendering` | **plays, but the recipe's own feature is not surfaced** — core offers canvas `rendering` links only in the canvas-info popover, which appears only on multi-canvas manifests, and this recipe has one canvas |
| `0026-toc-opera` | ranges with `#t=` fragments as chapters | plays; chapters seek |
| `0064-opera-one-canvas` | temporal composition — several media tiling one canvas | plays through the seam, under one transport |
| `0065-opera-multiple-canvases` | the same opera across canvases, `auto-advance` | plays through |
| `0074-multiple-language-captions` | a Choice of VTT tracks in several languages | plays; the toggle lists tracks by label |
| `0103-poetry-reading-annotations` | commenting annotations on `#t=` time ranges | **plays, but the recipe's own feature is not supported** — time-based annotation is out of scope for this plugin, so the comments are not shown against the playhead |
| `0219-using-caption-file` | one supplementing VTT track | plays; captions toggle and transcript panel |
| `0229-behavior-ranges` | ranges with per-range thumbnails over a video canvas | plays; chapters seek |
| `0434-choice-av` | a Choice of six audio formats | plays; the rendition is chosen by what the browser can decode, not first-wins |
| `0489-multimedia-canvas` | image, video and text painting one canvas at `#xywh=` | **documented degradation** — the image body paints through the ordinary tile pipeline; the spatially placed video and the painted text bodies are ignored, with a developer-console warning naming the fence |

So **12 of the 15 count as supported** in the recipe table above — the 14 that
play, less `0103` and `0017`, whose canvases play but whose subjects are features
the viewer does not surface. `0489` is a deliberate trade: full fidelity needs a
canvas clock and a text-rendering subsystem for one recipe, and the project chose
the documented degradation instead.

Fences worth knowing before adopting, all of them documented rather than
accidental: no MPEG-DASH; captions are WebVTT only (no TTML or SRT); a temporally
composed canvas has a brief gap at each segment seam, because gapless
`MediaSource` stitching is not implemented; and waveforms are drawn from
audiowaveform data linked from the manifest, never computed in the browser.

??? info "Exactly what was measured, and where it came from"

    Competitors measured 12 August 2026; the two Triiiceratops rows and the
    chunk table re-measured 18 August 2026 from a fresh `pnpm build:all`.
    **Triiiceratops was built from source**; every other row is that project's
    own published artifact, fetched from npm at the version shown and **not
    re-minified**. Both are legitimate; neither bundle was altered to make this
    table.

    **Compression is identical for every row**: raw file bytes, gzip level 9, and
    Brotli quality 11, all applied locally. Where a viewer ships more than one
    file, the total is the sum of those files compressed separately, matching
    separate HTTP responses.

    **The Triiiceratops rows reproduce to within tens of bytes, not to the
    byte.** Svelte hashes a component's filename into its scoped-CSS class name,
    and for the shared `packages/ui` components that filename is absolute, so the
    element artifact's size moves slightly with the directory it was built in —
    13 raw bytes between the two checkouts these numbers were cross-checked in.
    The plugin's IIFE has no cross-package components and is byte-identical
    anywhere. Repeat builds in one directory did reproduce the bytes exactly.

    | Viewer | What was counted | Source |
    | --- | --- | --- |
    | Triiiceratops | `triiiceratops-element.iife.js` — the whole viewer in one file; component CSS is injected into the shadow root | Built from [`e9ae251d`](https://github.com/d-flood/triiiceratops/commit/e9ae251d) with `pnpm build:all` |
    | Triiiceratops + `plugin-av` | the same file plus `@triiiceratops/plugin-av`'s `dist/iife.js` — two script tags, two HTTP responses, compressed separately. The plugin's four lazy chunks are **not** counted: none is fetched unless a manifest needs it, exactly as Universal Viewer's unloaded chunks are not counted in its row | Same build; measured by `pnpm size:check:pair` |
    | TIFY | `tify.js` + `tify.css` | [js](https://cdn.jsdelivr.net/npm/tify@0.35.0/dist/tify.js), [css](https://cdn.jsdelivr.net/npm/tify@0.35.0/dist/tify.css), [embed docs](https://github.com/tify-iiif-viewer/tify/blob/v0.35.0/README.md#embedding-tify) |
    | Diva.js | `diva.js` + the OpenSeadragon 6.0.2 build its README loads from a CDN | [js](https://unpkg.com/diva.js@7.4.0/build/diva.js), [OSD](https://cdn.jsdelivr.net/npm/openseadragon@6.0.2/build/openseadragon/openseadragon.min.js) |
    | Canvas Panel | `bundle.js` + `bundle.css` | [js](https://unpkg.com/@digirati/canvas-panel-web-components@1.0.74/dist/bundle.js), [css](https://unpkg.com/@digirati/canvas-panel-web-components@1.0.74/dist/bundle.css) |
    | Glycerine Viewer | UMD build + `style.css` | [js](https://unpkg.com/glycerine-viewer@2.1.0/dist/glycerine-viewer.umd.js), [css](https://unpkg.com/glycerine-viewer@2.1.0/dist/style.css) |
    | Universal Viewer | `UV.js` + `uv.css` + every JS and translation chunk a cold image session actually fetched — it code-splits, so a loaded session is the only honest total | [js](https://unpkg.com/universalviewer@4.4.2/dist/umd/UV.js), [css](https://unpkg.com/universalviewer@4.4.2/dist/uv.css), [embed docs](https://github.com/UniversalViewer/universalviewer/blob/v4.4.2/src/uv.html) |
    | Clover IIIF | web-components UMD build | [js](https://unpkg.com/@samvera/clover-iiif@3.12.0/dist/web-components/index.umd.js), [embed docs](https://samvera-labs.github.io/clover-iiif/docs/viewer#vanilla-javascript) |
    | Mirador | `mirador.min.js`, the self-contained UMD build. Its ESM build looks smaller only because it externalises React, ReactDOM and `@mui/material` | [js](https://unpkg.com/mirador@4.1.0/dist/mirador.min.js) |
    | OpenSeadragon | `openseadragon.min.js`, for the scale note above. Not a IIIF viewer, and not a row in the table | [js](https://cdn.jsdelivr.net/npm/openseadragon@6.1.0/build/openseadragon/openseadragon.min.js) |

    **The recipe counts** were read from the IIIF Cookbook
    [support matrix](https://iiif.io/api/cookbook/recipe/matrix/) on 12 August
    2026. That page renders 80 rows across eight categories, but several recipes
    appear under more than one category, so they were deduplicated by recipe to
    67 distinct ones. Of those, **15 are audiovisual** — the matrix's own A/V
    category (13 recipes) plus the two filed elsewhere,
    `0229-behavior-ranges` under Structuring Resources and
    `0489-multimedia-canvas` under Annotation Recipes — leaving the 52 counted in
    the table. A viewer's number is its count of "Yes" cells; "Partial" is
    reported separately rather than folded in.

    **This page said 14 and 53 until 14 August 2026, and that was wrong.** The
    split is no longer read off the matrix's categories: all 67 recipe manifests
    were fetched and searched for a `Sound` or `Video` painting body, and exactly
    15 carry one. That search is not fully reproducible from this repository:
    only the 15 and the image recipes the test suite needs are vendored, not all
    67. So the positive half of the result can be re-checked here — the 15 are
    on disk and do carry a time-based body — while the negative half, that no
    other recipe does, can only be re-checked by fetching the remainder from
    `iiif.io` again. The verified recipe-id list is recorded in the vendored
    fixtures'
    [`PROVENANCE.md`](https://github.com/d-flood/triiiceratops/blob/1699a868/packages/core/src/lib/test/fixtures/manifests/PROVENANCE.md).
    Moving one recipe out of the image column changed **no viewer's numerator**
    in the table above: every viewer with a column is marked "No" on both
    `0229-behavior-ranges` and `0489-multimedia-canvas`, and neither was among
    the image recipes Triiiceratops supports. Theseus, in the note below, is the
    one row the correction moves, because it is marked "Yes" on both.

    **The Triiiceratops + `plugin-av` row's 46** is 34 image recipes plus 12 of
    the 15 audiovisual ones, per the per-recipe table above. Like every other
    row in this column it is a self-assessment — the difference is that this
    one's evidence is the AV spec suite, named there, most of it driving the
    public demo end to end.

    Diva.js and Canvas Panel have no column in the matrix at all, hence "not
    listed" rather than a zero. The matrix's stated inclusion criteria are
    support for Presentation API 3.0, a public linkable instance, and at least
    one supported recipe. No count was invented for either: scoring a competitor
    ourselves would mix a self-assessment into a column every other row sources
    from the same place. Canvas Panel's dependency list is quoted from its own
    published `package.json`.

    Theseus leads the matrix — 50 of the 52, and 64 of all 67 — but has no size
    row here, because it is not distributed as an embeddable browser bundle on
    npm the way every viewer in this table is.

    Excluded everywhere: source maps, host HTML, manifests, images and tiles,
    fonts, external configuration, and optional media-specific assets. Plugins
    are excluded too, with the single stated exception of the
    `Triiiceratops + plugin-av` row, which exists because the viewer it is being
    compared to plays audio and video. Universal Viewer's English translation
    chunk is included because the session fetched it; its AV-only chunks stayed
    unloaded and are not counted, and neither are our four AV chunks.

    Both Triiiceratops rows are re-measured by
    [`scripts/size-check.mjs`](https://github.com/d-flood/triiiceratops/blob/1699a868/scripts/size-check.mjs)
    on every build, against a committed baseline for core and against TIFY's
    141,467 gzip for the pair, so they cannot drift from this page without CI
    going red. To reproduce them:

    ```bash
    pnpm build:all       # ends in `pnpm size:check:pair`
    pnpm size:check      # core's element artifacts alone
    ```

??? note "What this comparison does not tell you"

    - It measures transfer size only — not parsed size, memory, startup time, or
      the IIIF content a viewer then fetches.
    - Feature sets differ substantially, and so does packaging. Triiiceratops
      compiles all of its core locales into the element; TIFY keeps non-English
      translations in external JSON. The core-only Triiiceratops row excludes
      its separately shipped plugins, just as optional integrations are excluded
      elsewhere; the AV row adds exactly one of them, and no other plugin's
      bytes appear anywhere in this table.
    - Universal Viewer benefits from code splitting, so its row is only the code
      the image path needs. The self-contained viewers, ours included, transfer
      baseline features a given session may not use.
    - The recipe counts are a proxy for specification coverage, not for
      usefulness: recipes are not equally weighted, and a viewer can support
      fewer of them while doing more with each. The matrix is maintained by the
      community and its implementers rather than independently audited, so every
      row in that column — ours included — reflects what a project reports.
    - Neither recipe column captures viewers built for a different job. Ramp and
      Aviary support no non-AV recipes at all and would score zero in the image
      column while being purpose-built A/V viewers.
    - Other projects' versions are a dated snapshot, and so is the matrix.
      Re-measure before quoting this table long after 12 August 2026.
    - CDN compression can differ from these deterministic local settings.

Triiiceratops also publishes a second, equally self-contained element entry for
bundler consumers, `triiiceratops/element/register` — 397,257 raw / 116,974 gzip
/ 98,285 Brotli. It is larger because ES output keeps module structure. The
table uses the IIFE because that is the
[official plain-HTML embed](integration.md#any-framework-web-component). The AV
plugin's ESM build is not tabulated at all: it leaves `svelte` external as an
ordinary peer and emits its lazy modules as real chunks, so what a bundler
consumer ends up shipping depends on their own build rather than on a file we
can weigh.
