---
search:
  exclude: true
icon: lucide/feather
description: "How large Triiiceratops 1.0 is on the wire — raw, gzip and Brotli — against Mirador, Clover, Universal Viewer, TIFY, Canvas Panel, Diva.js, Mango and Glycerine, with capability plotted against size."
---

# Bundle size

Two charts. The first is what a browser transfers for an ordinary IIIF image
session; the second plots that weight against how much of IIIF each viewer
implements. Audio and video live in a plugin here, so there are **two
Triiiceratops rows**: core alone, and core plus `@triiiceratops/plugin-av` — the
like-for-like figure against the viewers below that play time-based media, which
is all of them except Diva.js.

## Size

<div class="tri-chart" aria-hidden="true"><div class="tri-chart-row"><span class="tri-chart-label tri-chart-label--self">Triiiceratops</span><span class="tri-chart-value">112.3 KB</span><span class="tri-chart-track"><span class="tri-chart-fill tri-chart-fill--self" style="width: 14.8%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label tri-chart-label--self">Triiiceratops + AV</span><span class="tri-chart-value">127.8 KB</span><span class="tri-chart-track"><span class="tri-chart-fill tri-chart-fill--self" style="width: 16.9%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">TIFY</span><span class="tri-chart-value">141.5 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 18.7%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Diva.js</span><span class="tri-chart-value">173.8 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 23.0%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Canvas Panel</span><span class="tri-chart-value">180.8 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 23.9%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Mango</span><span class="tri-chart-value">413.5 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 54.7%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Universal Viewer</span><span class="tri-chart-value">513.5 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 67.9%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Clover IIIF</span><span class="tri-chart-value">623.8 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 82.4%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Mirador</span><span class="tri-chart-value">713.9 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 94.4%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Glycerine</span><span class="tri-chart-value">756.5 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 100.0%"></span></span></div></div>

/// caption
gzip transfer size for an image session, in KB of 1000 bytes. Shorter is better.
///

| Viewer | Version | Raw | gzip | Brotli | vs. Triiiceratops core |
| --- | --- | ---: | ---: | ---: | ---: |
| **Triiiceratops** | 1.0.0-rc.36 | **382,620** | **112,287** | **94,000** | — |
| **Triiiceratops + `plugin-av`** | + 1.0.0-rc.0 | **423,481** | **127,782** | **107,815** | 1.14× |
| TIFY | 0.35.0 | 541,485 | 141,467 | 119,874 | 1.26× |
| Diva.js | 7.4.0 | 643,863 | 173,784 | 144,601 | 1.55× |
| Canvas Panel | 1.0.74 | 604,070 | 180,757 | 140,948 | 1.61× |
| Mango | 0.4.2 | 1,717,644 | 413,541 | 336,305 | 3.68× |
| Universal Viewer | 4.4.2 | 1,831,630 | 513,473 | 358,120 | 4.57× |
| Clover IIIF | 3.12.0 | 2,129,446 | 623,761 | 517,691 | 5.56× |
| Mirador | 4.1.0 | 2,430,874 | 713,937 | 558,083 | 6.36× |
| Glycerine Viewer | 2.1.0 | 2,937,265 | 756,475 | 610,070 | 6.74× |

Triiiceratops is the smallest of these viewers on all three columns at once, as a
single file with no code splitting. The audiovisual pair still beats TIFY, the
nearest row, by 13,685 gzip bytes — and `pnpm size:check:pair` fails the build if
that stops being true.

## Audiovisual sessions

Two of these viewers code-split, so a video manifest costs them different bytes
than an image one. Each row is the files that session actually fetched.

| Viewer | Image session | Audiovisual session | How it splits |
| --- | ---: | ---: | --- |
| **Triiiceratops + `plugin-av`** | **127,782** | **127,782** | four chunks exist and none is fetched by default |
| TIFY | 141,467 | 141,467 | one file, no chunks published |
| Canvas Panel | 180,757 | 180,757 | one file, no chunks published |
| Mango | 413,541 | 364,582 | renderers are per-media chunks, so an AV canvas skips OpenSeadragon. A manifest with both media types fetches both — 467,281 |
| Universal Viewer | 513,473 | 811,602 | four AV chunks (565,666) arrive; two image chunks (267,537) do not |
| Clover IIIF | 623,761 | 623,761 | one file, no chunks published |
| Mirador | 713,937 | 713,937 | one file, no chunks published |
| Glycerine Viewer | 756,475 | 756,475 | one file; its video.js fetches `vtt.min.js` (7,131) from a CDN only on a browser with no native WebVTT |

gzip bytes. Diva.js has no row because it has no audiovisual session.

Triiiceratops' own four chunks, none of them in the 15,495 gzip the AV plugin
adds above:

| Chunk | gzip | Fetched when |
| --- | ---: | --- |
| `av-hls.js` (hls.js) | 223,530 | an HLS stream must play on a browser with no native HLS |
| `av-transcript.js` | 3,216 | the canvas has captions, a `text/plain` transcript, or timed annotations |
| `av-waveform.js` | 2,584 | a canvas links audiowaveform data |
| `av-sequencer.js` | 2,094 | several media files tile one canvas's duration |

## Capability against size

<!-- BEGIN GENERATED recipe totals — do not edit by hand. Regenerate with: node scripts/docs-recipes.mjs -->

The proxy for capability is the number of IIIF Cookbook recipes each viewer is
recorded as fully supporting in the
[official support matrix](https://iiif.io/api/cookbook/recipe/matrix/) — 67
distinct recipes, 15 of them audiovisual. Both axes have to describe the same
viewer, so the size axis is each project's audiovisual session.

<!-- END GENERATED recipe totals -->

<svg class="tri-scatter" viewBox="0 0 680 400" role="img" aria-hidden="true" focusable="false">
  <line class="tri-scatter-grid" x1="70" y1="48" x2="650" y2="48" />
  <line class="tri-scatter-grid" x1="70" y1="121" x2="650" y2="121" />
  <line class="tri-scatter-grid" x1="70" y1="194" x2="650" y2="194" />
  <line class="tri-scatter-grid" x1="70" y1="267" x2="650" y2="267" />
  <line class="tri-scatter-axis" x1="70" y1="30" x2="70" y2="340" />
  <line class="tri-scatter-axis" x1="70" y1="340" x2="650" y2="340" />
  <text class="tri-scatter-tick" x="62" y="344" text-anchor="end">0</text>
  <text class="tri-scatter-tick" x="62" y="271" text-anchor="end">200</text>
  <text class="tri-scatter-tick" x="62" y="198" text-anchor="end">400</text>
  <text class="tri-scatter-tick" x="62" y="125" text-anchor="end">600</text>
  <text class="tri-scatter-tick" x="62" y="52" text-anchor="end">800</text>
  <text class="tri-scatter-tick" x="70" y="360" text-anchor="middle">0</text>
  <text class="tri-scatter-tick" x="236" y="360" text-anchor="middle">20</text>
  <text class="tri-scatter-tick" x="401" y="360" text-anchor="middle">40</text>
  <text class="tri-scatter-tick" x="567" y="360" text-anchor="middle">60</text>
  <text class="tri-scatter-axis-label" x="360" y="386" text-anchor="middle">Cookbook recipes supported, of 67 →</text>
  <text class="tri-scatter-axis-label" x="18" y="185" text-anchor="middle" transform="rotate(-90 18 185)">gzip KB ↑</text>
  <circle class="tri-scatter-point" cx="244" cy="44" r="5" />
  <text class="tri-scatter-point-label" x="254" y="48">Universal Viewer</text>
  <circle class="tri-scatter-point" cx="327" cy="64" r="5" />
  <text class="tri-scatter-point-label" x="337" y="68">Glycerine</text>
  <circle class="tri-scatter-point" cx="327" cy="80" r="5" />
  <text class="tri-scatter-point-label" x="337" y="84">Mirador</text>
  <circle class="tri-scatter-point" cx="219" cy="113" r="5" />
  <text class="tri-scatter-point-label" x="229" y="117">Clover IIIF</text>
  <circle class="tri-scatter-point" cx="327" cy="288" r="5" />
  <text class="tri-scatter-point-label" x="337" y="292">TIFY</text>
  <circle class="tri-scatter-point tri-scatter-point--self" cx="468" cy="293" r="6" />
  <text class="tri-scatter-point-label tri-scatter-point-label--self" x="479" y="297">Triiiceratops + AV</text>
</svg>

/// caption
Recipe coverage against the gzip bytes of an audiovisual session. Down and to the
right is better.
///

| Viewer | Recipes, of 67 | Audiovisual session, gzip | Bytes per recipe |
| --- | ---: | ---: | ---: |
| **Triiiceratops + `plugin-av`** | **48** | **127,782** | **2,662** |
| TIFY | 31 (+3 partial) | 141,467 | 4,564 |
| Clover IIIF | 18 (+1 partial) | 623,761 | 34,653 |
| Mirador | 31 (+3 partial) | 713,937 | 23,030 |
| Glycerine Viewer | 31 | 756,475 | 24,402 |
| Universal Viewer | 21 (+1 partial) | 811,602 | 38,648 |

<!-- BEGIN GENERATED recipe support notes — do not edit by hand. Regenerate with: node scripts/docs-recipes.mjs -->

Core alone supports **34** of 67, which is also what the matrix lists Triiiceratops at. With
`plugin-av` the pair reaches **48**: those recipes plus 14
of the 15 audiovisual recipes the AV spec suite drives end to end against the
[public demo](https://triiiceratops.org/demo/).

A further recipe is counted as partial rather than supported, because it renders
while the recipe's own feature does not:

- `0489-multimedia-canvas` — A painting body targeted at `#xywh=` is not placed within the canvas: the canvas plays under `plugin-av`, but degrades to its image body with a developer-console warning. Documented degradation — see the spatial-placement fence in [`plugin-av.md`](plugin-av.md).

<!-- END GENERATED recipe support notes -->

Diva.js, Canvas Panel and Mango have no matrix column; Theseus leads it at 64 of
67 but ships no browser bundle on npm.

??? info "Exactly what was measured, and where it came from"

    Measured 20 August 2026. **Triiiceratops was built from source**, with
    `pnpm build:all` from the `av-transport-in-bar` branch at
    [`60edf28f`](https://github.com/d-flood/triiiceratops/commit/60edf28f); every
    other row is that project's own published artifact at the version shown, not
    re-minified. Compression is identical everywhere: raw bytes, gzip level 9,
    Brotli quality 11, applied locally, and a multi-file total is the sum of
    those files compressed separately, matching separate HTTP responses.

    **Sessions were measured in a browser, not guessed from a build.** Each
    viewer's own documented embed was served locally and driven with Playwright
    against Cookbook `0001-mvm-image`, `0003-mvm-video` and `0002-mvm-audio`,
    recording every request the page made. Where a row says "no chunks
    published", the package's dist directory contains no sibling chunk to fetch.

    | Viewer | What was counted | Source |
    | --- | --- | --- |
    | Triiiceratops | `triiiceratops-element.iife.js` — the whole viewer in one file, CSS injected into the shadow root | built from source |
    | Triiiceratops + `plugin-av` | the same file plus the plugin's `dist/iife.js`; its four lazy chunks are not counted, as no session fetches them | `pnpm size:check:pair` |
    | TIFY | `tify.js` + `tify.css` | [js](https://cdn.jsdelivr.net/npm/tify@0.35.0/dist/tify.js), [css](https://cdn.jsdelivr.net/npm/tify@0.35.0/dist/tify.css) |
    | Diva.js | `diva.js` + the OpenSeadragon 6.0.2 its README loads | [js](https://unpkg.com/diva.js@7.4.0/build/diva.js), [OSD](https://cdn.jsdelivr.net/npm/openseadragon@6.0.2/build/openseadragon/openseadragon.min.js) |
    | Canvas Panel | `bundle.js` + `bundle.css` | [js](https://unpkg.com/@digirati/canvas-panel-web-components@1.0.74/dist/bundle.js), [css](https://unpkg.com/@digirati/canvas-panel-web-components@1.0.74/dist/bundle.css) |
    | Mango | `mango-viewer-element.js` plus every chunk the session fetched — 16 files for images, 17 for AV. It injects its styles from JS | [module](https://cdn.jsdelivr.net/npm/@mango-iiif/iiif-viewer@0.4.2) |
    | Universal Viewer | `UV.js` + `uv.css` + every chunk the session fetched — 10 files for images, 12 for AV | [js](https://unpkg.com/universalviewer@4.4.2/dist/umd/UV.js), [css](https://unpkg.com/universalviewer@4.4.2/dist/uv.css) |
    | Clover IIIF | web-components UMD build; its documented script tag loads no stylesheet | [js](https://unpkg.com/@samvera/clover-iiif@3.12.0/dist/web-components/index.umd.js) |
    | Mirador | `mirador.min.js`, the self-contained UMD build — its ESM build looks smaller only because it externalises React and MUI | [js](https://unpkg.com/mirador@4.1.0/dist/mirador.min.js) |
    | Glycerine Viewer | `jslib/` — the widget its README documents for a script tag, "packed with all required dependencies such as Vue and PrimeVue". Its `dist/` build externalises them and is not what a page loads. 58% of the widget's stylesheet is `data:` URI fonts and icons, which this page excludes everywhere: 61,319 gzip instead of 384,277 | [js](https://unpkg.com/glycerine-viewer@2.1.0/jslib/glycerine-viewer.umd.cjs), [css](https://unpkg.com/glycerine-viewer@2.1.0/jslib/style.css) |

    **The recipe counts** were read from the matrix on 20 August 2026. It renders
    80 rows across eight categories; several recipes appear twice, so they
    deduplicate to 67. A viewer's number is its count of "Yes" cells, with
    "Partial" reported separately rather than folded in. The 15 audiovisual
    recipes are not read off the matrix's categories — all 67 manifests were
    fetched and searched for a `Sound` or `Video` painting body, and exactly 15
    carry one. The verified ids are in the vendored fixtures'
    [`PROVENANCE.md`](https://github.com/d-flood/triiiceratops/blob/60edf28f/packages/core/src/lib/test/fixtures/manifests/PROVENANCE.md).

    Excluded everywhere: source maps, host HTML, manifests, images and tiles,
    fonts, external configuration, and optional media-specific assets. Plugins
    are excluded too, with the single exception of the `plugin-av` row, which
    exists because nearly every viewer it is compared against plays audio and
    video. Both Triiiceratops rows are re-measured by
    [`scripts/size-check.mjs`](https://github.com/d-flood/triiiceratops/blob/60edf28f/scripts/size-check.mjs)
    on every build, so they cannot drift from this page without CI going red:

    ```bash
    pnpm build:packages  # ends in `pnpm size:check:pair`
    ```

??? note "What this comparison does not tell you"

    - Transfer size only — not parsed size, memory, startup time, or the IIIF
      content a viewer then fetches.
    - Feature sets and packaging differ. Triiiceratops compiles all of its core
      locales into the element; TIFY keeps non-English translations in external
      JSON.
    - A session is one manifest's worth of behaviour, not a site's. Universal
      Viewer's and Mango's rows both move for a collection that mixes image and
      time-based canvases.
    - Recipe counts proxy specification coverage, not usefulness: recipes are not
      equally weighted, and the matrix reflects what each project reports rather
      than an independent audit. Purpose-built A/V viewers like Ramp and Aviary
      support no image recipes at all.
    - Versions and the matrix are a dated snapshot. Re-measure before quoting
      these tables long after 20 August 2026.
    - CDN compression can differ from these deterministic local settings.

The bundler-facing element entry, `triiiceratops/element/register`, is 399,518 raw
/ 117,642 gzip / 98,863 Brotli — larger because ES output keeps module structure.
These tables use the IIFE because that is the
[official plain-HTML embed](integration.md#any-framework-web-component).
