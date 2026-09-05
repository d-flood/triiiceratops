# IIIF viewer bundle-size snapshot

Measured 9 August 2026. This compares the viewer code needed for an ordinary
IIIF image session, not just each package's entry file. It is not a benchmark of
features or runtime performance.

**Methodology: as-shipped.** Every row is that project's own published browser
assets, fetched from its own registry artifact and followed from its official
plain-HTML embedding instructions, then compressed locally at gzip level 9 and
Brotli quality 11. **No bundle was re-minified, including ours.** Triiiceratops
runs terser because Triiiceratops ships terser; every competitor chose its own
tooling, and what a reader downloads is the result of that choice, not of ours.
A normalized "everyone gets the same minifier" comparison is a different
question, and it is answered separately [below](#how-much-of-the-lead-is-tooling).

## Results

Sorted by gzip, the metric integrators usually quote.

| Viewer | Version | Browser assets counted | Raw | gzip | Brotli |
| --- | --- | --- | ---: | ---: | ---: |
| **Triiiceratops** | 1.0.0-rc.36 | self-contained element IIFE | **398,892** | **112,556** | **93,052** |
| TIFY | 0.35.0 | `tify.js` + `tify.css` | 541,485 | 141,467 | 119,874 |
| Diva.js | 7.4.0 | `diva.js` + OpenSeadragon 6.0.2 | 643,863 | 173,784 | 144,601 |
| Canvas Panel | 1.0.74 | `bundle.js` + `bundle.css` | 604,070 | 180,757 | 140,948 |
| Glycerine Viewer | 2.1.0 | UMD + `style.css` | 1,118,864 | 339,905 | 286,755 |
| Universal Viewer | 4.4.2 | bootstrap + image-viewer chunks + `en` | 1,831,630 | 513,473 | 358,120 |
| Clover IIIF | 3.11.0 | web-components UMD | 2,127,423 | 623,250 | 516,989 |
| Mirador | 4.1.0 | `mirador.min.js` | 2,430,874 | 713,937 | 558,083 |

In KiB, for the three smallest: Triiiceratops is 389.5 KiB raw, 109.9 KiB gzip,
90.8 KiB Brotli; TIFY is 528.8 / 138.2 / 117.1; Diva.js is 628.8 / 169.7 /
141.2.

## Takeaway

**Triiiceratops is the smallest IIIF viewer measured, on raw bytes, gzip, and
Brotli simultaneously, as a self-contained single file with no code splitting.**

Against gzip, it is 20.4% smaller than TIFY, 35.2% smaller than Diva.js, 37.7%
smaller than Canvas Panel, 66.9% smaller than Glycerine, 78.1% smaller than
Universal Viewer's image-session code, 81.9% smaller than Clover, and 84.2%
smaller than Mirador. The raw and Brotli orderings agree: against TIFY the three
margins are 26.3% raw, 20.4% gzip, and 22.4% Brotli.

The previous revision of this document said the opposite about the row that
matters: Triiiceratops was then 15.8% *larger* than TIFY after gzip while being
1.4% smaller before it, and the accompanying prose explained why the compression
ratio was against us. That is no longer the position, and the explanation is not
a better compressor — it is 51,311 fewer gzip bytes of first-party payload. See
[what changed](#what-changed-since-the-last-revision).

Universal Viewer's `UV.js` and CSS alone are only 197,971 raw / 67,546 gzip /
59,038 Brotli, but that is a loader, not a usable viewer. A cold image session
also fetched two bootstrap chunks, five image-viewer chunks, and an English
translation chunk. AV-specific chunks were not fetched or counted.

Internet Archive BookReader is deliberately absent. It is a jQuery-based page
reader with optional IIIF support rather than a like-for-like IIIF viewer, so a
byte total for it would not answer the question this table asks.

The occasionally requested `Tiiify` is listed by its canonical project name,
**TIFY**.

## Both published element artifacts

Triiiceratops publishes two Web Component entry points, and both are
self-contained. Earlier revisions of this document measured only the first.

| Entry | File | Raw | gzip | Brotli |
| --- | --- | ---: | ---: | ---: |
| `triiiceratops/element` | `triiiceratops-element.iife.js` | 398,892 | 112,556 | 93,052 |
| `triiiceratops/element/register` | `triiiceratops-element.js` | 417,502 | 118,456 | 98,271 |

The IIFE is what a `<script src>` tag loads and what the comparison table uses,
because that is the official plain-HTML embed. The ESM entry is the same element
as a side-effect `import`, for consumers who reach it through a bundler; it is
larger because ES output keeps module structure.

A note for anyone comparing the two entries' history. The ESM artifact dropped
from 671,046 to 417,502 raw bytes when the terser pass landed, against the
IIFE's much smaller move, and that gap is not a measure of how much terser
found. Vite preserves whitespace in ES library output — it disables esbuild's
whitespace minification only, keeping identifier and syntax minification on —
because collapsed whitespace can interfere with the pure annotations a
downstream bundler tree-shakes on. This artifact is a self-contained
side-effect entry that registers an element; nothing downstream tree-shakes it,
so collapsing that whitespace is both safe and appropriate. But the resulting
number is dominated by formatting, and is not comparable to the IIFE's figure as
"what terser bought".

**Both figures come from `scripts/size-check.mjs`**, the script CI runs as part
of `pnpm build:element`. It measures these two files with exactly the gzip and
Brotli settings quoted above and compares them against the committed
`size-baseline.json`. The consequence is deliberate: this document and the size
gate cannot drift apart without the gate going red. To reproduce every
Triiiceratops number here:

```bash
pnpm build:lib && pnpm build:element
pnpm size:check
```

## What changed since the last revision

The `shrink-the-element-bundle` epic. Its starting point, from the previous
revision of this document, was 534,170 raw / 163,863 gzip for the IIFE; it now
measures 398,892 / 112,556, a reduction of 135,278 raw bytes (25.3%) and 51,307
gzip bytes (31.3%). The reductions, largest first:

- **DOMPurify was retired** in favour of a first-party IIIF rich-text renderer,
  removing 29,546 raw bytes and leaving core's runtime `dependencies` empty.
- **A terser pass was added** after esbuild in both element builds, worth a
  further 7.9% of the IIFE's gzip bytes — 122,243 down to 112,556.
- **Component CSS is now minified.** `emitCss: false` puts scoped CSS into JS
  string literals, which bypassed the CSS pipeline entirely; 30,493 bytes of it
  were comments.
- **Only the icons the viewer renders are generated.** The table was 48 glyphs ×
  3 weights = 144 entries and is now 43: 34 at `regular`, 6 at `bold`, 3 at
  `fill`. The icon component indexes the table dynamically, so nothing surplus
  could be tree-shaken.
- **The state inventory's review prose stopped shipping.** The runtime reads one
  thing from that 548-line document — the names of the notifying members — and
  downloaded the rest to every visitor.
- **Only the custom-element wrapper is compiled as a custom element.** The
  element builds set a global `customElement: true`, putting every component
  through custom-element codegen.

### One old figure could not be reproduced

The previous revision quoted 135,033 Brotli bytes for the pre-epic IIFE. That
number is not reproducible by the current toolchain: rebuilding the same commit
measured roughly 60 bytes higher. The cause was not investigated — it is a
sub-0.05% discrepancy in a figure that is now historical — but it is not
silently overwritten here, because a reader comparing this revision against the
last one deserves to know that the old Brotli column and the new one did not
come out of the same measurement. The raw and gzip figures did reproduce, which
is why the reduction above is stated in those two metrics.

Every figure in this revision comes from `scripts/size-check.mjs` instead, so
the same problem cannot recur unnoticed: the gate would fail.

### Two behaviour changes came with the reductions

The build-level reductions changed nothing a user can see. The DOMPurify
removal did, and this document should not imply otherwise:

- **Rich-text markup outside IIIF's allowlist is no longer rendered as markup.**
  The renderer emits `a`, `b`, `br`, `i`, `img`, `p`, `small`, `span`, `sub` and
  `sup` only. A dropped element keeps its text, so nothing disappears — but
  `ul`/`ol`/`li` and `table` markup in a manifest loses its structure, and no
  `style` attribute is emitted or read.
- **Search excerpts are plain text.** `SearchHit.before`, `match` and `after`
  reached raw HTML sinks with no sanitizer at all, which let any host-supplied
  `SearchProvider` or remote Content Search service execute script in the host
  page. They are now rendered as text nodes, with bare `<mark>` still honoured
  as a highlight delimiter. Any other markup a provider returned now renders as
  visible characters.

Both are described in full in the release changesets. No panel, locale, theme,
or icon the viewer renders was removed to reach these bytes.

## Method

- Selected the latest non-prerelease npm package available on the measurement
  date for each competitor.
- Followed each project's official plain-HTML embedding instructions.
- Counted the self-contained JS and CSS for Triiiceratops, TIFY, Diva.js, Canvas
  Panel, Glycerine, Clover, and Mirador. For code-split Universal Viewer, loaded
  an ordinary IIIF Image API manifest through its official `uv.html` embed in
  Chromium and counted every package JS/CSS/translation chunk fetched through
  image-viewer readiness.
- Excluded source maps, host HTML, manifests, images and tiles, external
  configuration files, fonts, plugins, and optional media-specific assets.
  Universal Viewer's fetched English translation is included because it is a
  required code chunk; external translations not fetched in the measured default
  session are excluded.
- Measured raw file bytes, gzip level 9, and Brotli quality 11. Multi-file totals
  are the sum of files compressed separately, matching separate HTTP responses.
- Built Triiiceratops from commit `cb9e934a37cd` with
  `pnpm build:lib && pnpm build:element`. Its official custom-element embed needs
  only `dist/triiiceratops-element.iife.js`; component CSS is injected into the
  shadow root.

### Provenance of the competitor rows

The competitor figures were first measured on 8 August 2026. Seven of the eight
rows are pure artifact arithmetic, so they were re-fetched and re-compressed on
9 August 2026 to confirm the whole table belongs to one measurement: TIFY,
Diva.js, Canvas Panel, Glycerine, Clover, and Mirador reproduced **byte-exactly**
on all three metrics, from the artifacts linked below and the same gzip level 9
and Brotli quality 11 settings.

Universal Viewer is the exception. Its total is a capture of a live browser
session, not a fixed asset list, so it was not re-derived; its `UV.js` and
`uv.css` were re-fetched and do reproduce, and the session accounting below is
carried forward from 8 August. Treat that one row as the older measurement it
is.

### Universal Viewer accounting

| Stage | Raw bytes | gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| `UV.js`, CSS, and two bootstrap chunks | 438,955 | 145,202 | 124,904 |
| Five required image-viewer chunks | 1,386,723 | 365,895 | 231,233 |
| English translation chunk | 5,952 | 2,376 | 1,983 |
| **Total viewer code** | **1,831,630** | **513,473** | **358,120** |

Readiness required a visible OpenSeadragon canvas and zoom control, a successful
IIIF Image API request, network idle, and a 500 ms settlement period. The host
document, favicon, manifest, `info.json`, and image tiles are not in the total.
The AV-only chunks `3989` and `8341`, together 1.38 MiB raw, remained unloaded.

### What is in Triiiceratops

Terser emits no source map for the element builds, so the composition below is
attributed from the **esbuild-only** stage of the same pipeline — the 410,604
raw bytes that terser then takes to 398,892. Proportions are what this table is
for; the totals are 2.9% higher than what ships.

A source-mapped reporting build attributed all but 25 of those bytes across 312
rendered modules. There were zero OpenSeadragon,
DOMPurify, Annotorious, Manifesto, or `@iiif/*` modules. OpenSeadragon remains
installed in this workspace only through the separate annotation-editor package;
it is not reachable from the core element.

| Category | Minified raw bytes, pre-terser |
| --- | ---: |
| Viewer components and chrome, including scoped CSS | 189,234 |
| Svelte app runtime | 52,991 |
| IIIF utilities, theming, and the plugin surface | 46,023 |
| Viewer state | 35,602 |
| Canvas renderer | 26,856 |
| Compiled locale messages | 21,200 |
| Embedded icons | 16,398 |
| Svelte custom-element wrapper | 15,673 |
| First-party IIIF rich-text renderer | 6,191 |
| Third-party runtime code (`clsx`, `esm-env`) | 368 |

Scoped component CSS has no row of its own because `emitCss: false` keeps it in
JS string literals inside each component, so the source map attributes it to the
component that declared it. These are source-map attributions, so their
compressed sizes are not independently additive.

Third-party runtime code is 368 bytes, or 0.09% of the artifact. That is the
whole of it.

### The framework runtime is not a wash, and it is not our cost

A previous revision of this document claimed that Triiiceratops' Svelte runtime
and TIFY's Vue runtime were "roughly a wash rather than a cost unique to TIFY".
That claim was wrong, and it understated us.

Of the 68,664 bytes of Svelte in the element, **15,673 (23%) is the
custom-element wrapper** — code TIFY has no counterpart for, because TIFY is a
Vue app mounted into a `div` rather than a web component. The like-for-like
comparison is 52,991 bytes of Svelte app runtime against 65,883 bytes of Vue:
Svelte is roughly 20% smaller. We carry a web-component wrapper TIFY does not,
and still ship less framework.

### Why TIFY still compresses better than we do

TIFY includes the Vue 3.5.27 production runtime, OpenSeadragon, and its CSS.
A source-mapped rebuild attributes about 65,883 minified raw bytes to Vue and
277,682 bytes to OpenSeadragon. Its 61,381-byte CSS file shrinks to only 7,008
bytes gzip, and its OpenSeadragon, Vue, and generated component patterns are
highly repetitive. TIFY therefore compresses to 26.1% of raw size, while
Triiiceratops compresses to 28.2%.

That ratio used to reverse the raw ordering and put TIFY ahead on gzip. It no
longer does, because the raw gap is now 142,594 bytes rather than 7,315. The
ratio is still real; it is simply no longer decisive.

### How much of the lead is tooling

Some of it, and this should be said plainly. Applying the same terser settings we
use to competitors' shipped bundles gains TIFY 3.0% of its gzip bytes, Clover
4.0%, and Mirador 4.8%, against the 7.9% it gains us — so roughly four points of
the gzip margin is tooling a competitor could adopt tomorrow.

The rest is durable. Against a hypothetically terser-equipped TIFY (536,021 raw
/ 137,275 gzip / 116,098 Brotli) Triiiceratops is still 25.6% smaller raw, 18.0%
smaller gzip, and 19.9% smaller Brotli. The durable part is the 277 KB of
OpenSeadragon TIFY carries and we no longer do.

### Mirador's ESM build is not the comparison

`mirador.es.js` looks dramatically smaller than `mirador.min.js`, and it is not
a smaller viewer. It externalises React, ReactDOM, and all of `@mui/material`,
so a page loading it downloads those separately. The UMD build is the
self-contained artifact and therefore the correct row, which is what the table
uses. This is noted so the figure is not "corrected" later by someone who spots
the discrepancy.

### Reproducing the compression

Save as `size.cjs` and run `node size.cjs <file>`:

```js
const fs = require('node:fs');
const zlib = require('node:zlib');

const input = fs.readFileSync(process.argv[2]);
console.log({
    raw: input.length,
    gzip: zlib.gzipSync(input, { level: 9 }).length,
    brotli: zlib.brotliCompressSync(input, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
});
```

`scripts/size-check.mjs` measures the two Triiiceratops artifacts with exactly
these settings.

## Sources and selected artifacts

- Triiiceratops: [official integration guide](integration.md#any-framework-web-component),
  [`package.json`](../packages/core/package.json),
  [`vite.config.element.ts`](../packages/core/vite.config.element.ts), and
  [`scripts/size-check.mjs`](../scripts/size-check.mjs). Measured
  `packages/core/dist/triiiceratops-element.iife.js` and
  `packages/core/dist/triiiceratops-element.js` locally.
- Mirador: [official v4.1.0 embedding instructions](https://github.com/ProjectMirador/mirador/blob/v4.1.0/README.md#for-mirador-users),
  [build configuration](https://github.com/ProjectMirador/mirador/blob/v4.1.0/vite-umd.config.js),
  and [measured artifact](https://unpkg.com/mirador@4.1.0/dist/mirador.min.js).
- Universal Viewer: [official v4.4.2 embed document](https://github.com/UniversalViewer/universalviewer/blob/v4.4.2/src/uv.html),
  [Webpack configuration](https://github.com/UniversalViewer/universalviewer/blob/v4.4.2/webpack.config.js),
  [JS artifact](https://unpkg.com/universalviewer@4.4.2/dist/umd/UV.js), and
  [CSS artifact](https://unpkg.com/universalviewer@4.4.2/dist/uv.css). The image
  session used the [IIIF Cookbook Image Service fixture](https://iiif.io/api/cookbook/recipe/0005-image-service/manifest.json).
- Clover IIIF: [official vanilla-JavaScript instructions](https://samvera-labs.github.io/clover-iiif/docs/viewer#vanilla-javascript),
  [plain-HTML fixture](https://github.com/samvera-labs/clover-iiif/blob/d5565fa637ccff2f8dfcd58dc8e76547943aad36/playwright/html/index.html),
  [build configuration](https://github.com/samvera-labs/clover-iiif/blob/d5565fa637ccff2f8dfcd58dc8e76547943aad36/build/build.mjs),
  and [measured artifact](https://unpkg.com/@samvera/clover-iiif@3.11.0/dist/web-components/index.umd.js).
- TIFY: [official v0.35.0 embedding instructions](https://github.com/tify-iiif-viewer/tify/blob/v0.35.0/README.md#embedding-tify),
  [build configuration](https://github.com/tify-iiif-viewer/tify/blob/v0.35.0/vite.config.js),
  [JS artifact](https://cdn.jsdelivr.net/npm/tify@0.35.0/dist/tify.js), and
  [CSS artifact](https://cdn.jsdelivr.net/npm/tify@0.35.0/dist/tify.css).
- Diva.js: [official v7.4.0 getting-started instructions](https://unpkg.com/diva.js@7.4.0/README.md),
  which load OpenSeadragon from a CDN alongside the viewer.
  [JS artifact](https://unpkg.com/diva.js@7.4.0/build/diva.js) and the
  [OpenSeadragon 6.0.2 build](https://cdn.jsdelivr.net/npm/openseadragon@6.0.2/build/openseadragon/openseadragon.min.js)
  its README names.
- Canvas Panel: [JS artifact](https://unpkg.com/@digirati/canvas-panel-web-components@1.0.74/dist/bundle.js)
  and [CSS artifact](https://unpkg.com/@digirati/canvas-panel-web-components@1.0.74/dist/bundle.css).
- Glycerine Viewer: [JS artifact](https://unpkg.com/glycerine-viewer@2.1.0/dist/glycerine-viewer.umd.js)
  and [CSS artifact](https://unpkg.com/glycerine-viewer@2.1.0/dist/style.css).

## Caveats

- This measures transfer size, not parsed size, memory, startup time, or fetched
  IIIF content.
- Competitor versions are a dated snapshot and are not updated as those projects
  release. Re-measure before quoting this table long after its date.
- Feature sets differ substantially. Core-only Triiiceratops excludes its
  separately shipped plugins, just as optional integrations and runtime media
  are excluded elsewhere.
- Packaging differs substantially too. Triiiceratops compiles all of its core
  locales into the element, while TIFY keeps non-English translations in
  external JSON.
- Universal Viewer benefits from code splitting: this measures only code needed
  by the image path. The self-contained viewers also transfer baseline features
  that the selected session may not exercise. Triiiceratops does not code-split;
  every figure here is the whole viewer in one file.
- Clover also publishes a 15,607-byte raw stylesheet, but its official vanilla
  embed and plain-HTML fixture do not load it. Including it raises Clover to
  629,697 gzip bytes and does not change the conclusion.
- Diva.js's total depends on the OpenSeadragon build a host chooses; this uses
  the exact CDN URL its README prints.
- CDN compression can differ from these deterministic local compression levels.
