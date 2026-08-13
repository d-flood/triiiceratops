---
search:
  exclude: true
icon: lucide/feather
description: "How large Triiiceratops is on the wire — raw, gzip and Brotli — measured against Mirador, Clover, Universal Viewer, TIFY, Canvas Panel, Diva.js and Glycerine."
---

# Bundle size

Triiiceratops is the smallest IIIF viewer measured — on raw bytes, gzip and
Brotli at once — as a self-contained single file with no code splitting. Each
row below is the viewer code a browser transfers for an ordinary IIIF image
session, not just a package's entry file. But not all viewers have equal capability. Importantly, Triiiceratops only supports image canvases right now, not A/V.

<div class="tri-chart" aria-hidden="true"><div class="tri-chart-row"><span class="tri-chart-label tri-chart-label--self">Triiiceratops</span><span class="tri-chart-value">116.5 KB</span><span class="tri-chart-track"><span class="tri-chart-fill tri-chart-fill--self" style="width: 16.3%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">TIFY</span><span class="tri-chart-value">141.5 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 19.8%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Diva.js</span><span class="tri-chart-value">173.8 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 24.3%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Canvas Panel</span><span class="tri-chart-value">180.8 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 25.3%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Glycerine</span><span class="tri-chart-value">339.9 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 47.6%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Universal Viewer</span><span class="tri-chart-value">513.5 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 71.9%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Clover IIIF</span><span class="tri-chart-value">623.8 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 87.4%"></span></span></div><div class="tri-chart-row"><span class="tri-chart-label">Mirador</span><span class="tri-chart-value">713.9 KB</span><span class="tri-chart-track"><span class="tri-chart-fill" style="width: 100.0%"></span></span></div></div>

/// caption
gzip transfer size, in KB of 1000 bytes. Shorter is better.
///

| Viewer | Version | Raw | gzip | Brotli | vs. Triiiceratops |
| --- | --- | ---: | ---: | ---: | ---: |
| **Triiiceratops** | 1.0.0-rc.36 | **412,021** | **116,544** | **96,246** | — |
| TIFY | 0.35.0 | 541,485 | 141,467 | 119,874 | 1.21× |
| Diva.js | 7.4.0 | 643,863 | 173,784 | 144,601 | 1.49× |
| Canvas Panel | 1.0.74 | 604,070 | 180,757 | 140,948 | 1.55× |
| Glycerine Viewer | 2.1.0 | 1,118,864 | 339,905 | 286,755 | 2.92× |
| Universal Viewer | 4.4.2 | 1,831,630 | 513,473 | 358,120 | 4.41× |
| Clover IIIF | 3.12.0 | 2,129,446 | 623,761 | 517,691 | 5.35× |
| Mirador | 4.1.0 | 2,430,874 | 713,937 | 558,083 | 6.13× |

All three size columns are bytes; the "vs." column is gzip bytes as a multiple of
ours, and the chart above plots that same gzip column.

For scale: OpenSeadragon 6.1.0 is 87,297 gzip bytes as a bare tile renderer with
no manifest handling, navigation, metadata, search or localization. Triiiceratops
is a complete viewer for 1.34× that. Canvas Panel, which likewise renders
canvases rather than providing a full viewer, is 1.55× ours.

## How much of IIIF each one implements

Bytes only mean something next to capability. A rough proxy is how many of the
IIIF Cookbook recipes each viewer is recorded as fully supporting in the
[official support matrix](https://iiif.io/api/cookbook/recipe/matrix/), in the
same row order as above.

| Viewer | Image recipes, of 53 | All recipes, of 67 |
| --- | ---: | ---: |
| **Triiiceratops** | **34** | 34 |
| TIFY | 26 (+3 partial) | 31 (+3 partial) |
| Diva.js | not listed | not listed |
| Canvas Panel | not listed | not listed |
| Glycerine Viewer | 29 | 31 |
| Universal Viewer | 15 (+1 partial) | 21 (+1 partial) |
| Clover IIIF | 12 (+1 partial) | 18 (+1 partial) |
| Mirador | 28 (+3 partial) | 31 (+3 partial) |

**The image column is the like-for-like one**, and Triiiceratops leads it — by a
margin that holds even if every other viewer's partials are counted as full. It
excludes the 14 audiovisual recipes so that it matches what the byte table
measures: Universal Viewer code-splits, so its size row is only the chunks an
image session fetched, with 1.38 MiB of AV chunks left unloaded. Counting AV
recipes there would credit capability whose bytes were deliberately not counted.

**The all-recipes column is what each project supports in total**, and the gap
between the two columns is exactly the audiovisual work a viewer does. It is
worth reading, for two reasons. The self-contained viewers ship their AV code
whether a session uses it or not, so for TIFY, Glycerine, Clover and Mirador that
gap is weight already inside their byte figures. And the reason Triiiceratops'
two columns are identical is blunt: **it supports no audiovisual recipes at all.**
It is an image viewer. If you need audio or video, neither table is the
comparison you want.

**Canvas Panel's "not listed" is a category, not a failure**, and it is the most
interesting row here. The matrix only admits clients with a public, linkable
viewer instance, which a component library does not have. Canvas Panel is one: its
published package depends on `@iiif/vault`, `@iiif/presentation-2`,
`@iiif/presentation-3`, `@atlas-viewer/atlas` and Preact — a complete
manifest-parsing and tile-rendering stack — but exposes it as canvas-rendering
custom elements for building a viewer rather than as a viewer. So it pays for a
full IIIF stack in its 604,070 bytes, 1.55× our gzip, while leaving navigation,
metadata, search and the rest of the interface to whoever embeds it. Diva.js
supports Presentation API v2 and v3 by its own README and would qualify; it
simply has no column.

??? info "Exactly what was measured, and where it came from"

    Measured 12 August 2026. **Triiiceratops was built from source**; every other
    row is that project's own published artifact, fetched from npm at the version
    shown and **not re-minified**. Both are legitimate; neither bundle was
    altered to make this table.

    **Compression is identical for every row**: raw file bytes, gzip level 9, and
    Brotli quality 11, all applied locally. Where a viewer ships more than one
    file, the total is the sum of those files compressed separately, matching
    separate HTTP responses.

    | Viewer | What was counted | Source |
    | --- | --- | --- |
    | Triiiceratops | `triiiceratops-element.iife.js` — the whole viewer in one file; component CSS is injected into the shadow root | Built from [`ca610fa2ec91`](https://github.com/d-flood/triiiceratops/commit/ca610fa2ec91d75273b7678a7ec32f17cad7ff29) with `pnpm build:lib && pnpm build:element` |
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
    67 distinct ones. Of those, 14 are audiovisual — the matrix's own A/V
    category plus the audio and video recipes filed elsewhere, such as
    `0002-mvm-audio` and `0003-mvm-video` — leaving the 53 counted in the table.
    A viewer's number is its count of "Yes" cells; "Partial" is reported
    separately rather than folded in.

    Diva.js and Canvas Panel have no column in the matrix at all, hence "not
    listed" rather than a zero. The matrix's stated inclusion criteria are
    support for Presentation API 3.0, a public linkable instance, and at least
    one supported recipe. No count was invented for either: scoring a competitor
    ourselves would mix a self-assessment into a column every other row sources
    from the same place. Canvas Panel's dependency list is quoted from its own
    published `package.json`.

    Theseus leads the matrix — 51 of the 53, and 64 of all 67 — but has no size
    row here, because it is not distributed as an embeddable browser bundle on
    npm the way every viewer in this table is.

    Excluded everywhere: source maps, host HTML, manifests, images and tiles,
    fonts, external configuration, plugins, and optional media-specific assets.
    Universal Viewer's English translation chunk is included because the session
    fetched it; its AV-only chunks stayed unloaded and are not counted.

    The two Triiiceratops figures are re-measured by
    [`scripts/size-check.mjs`](https://github.com/d-flood/triiiceratops/blob/ca610fa2ec91d75273b7678a7ec32f17cad7ff29/scripts/size-check.mjs)
    on every `pnpm build:element`, against a committed baseline, so they cannot
    drift from this page without CI going red. To reproduce them:

    ```bash
    pnpm build:lib && pnpm build:element
    pnpm size:check
    ```

??? note "What this comparison does not tell you"

    - It measures transfer size only — not parsed size, memory, startup time, or
      the IIIF content a viewer then fetches.
    - Feature sets differ substantially, and so does packaging. Triiiceratops
      compiles all of its core locales into the element; TIFY keeps non-English
      translations in external JSON. Core-only Triiiceratops excludes its
      separately shipped plugins, just as optional integrations are excluded
      elsewhere.
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
bundler consumers, `triiiceratops/element/register` — 431,218 raw / 122,759 gzip
/ 101,964 Brotli. It is larger because ES output keeps module structure. The
table uses the IIFE because that is the
[official plain-HTML embed](integration.md#any-framework-web-component).
