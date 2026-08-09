# IIIF viewer bundle-size snapshot

Measured 8 August 2026. This compares the viewer code needed for an ordinary
IIIF image session, not just each package's entry file. It is not a benchmark of
features or runtime performance.

## Results

| Viewer | Version | Browser assets counted | Raw | gzip | Brotli |
| --- | --- | --- | ---: | ---: | ---: |
| TIFY | 0.35.0 | JS + CSS | 528.8 KiB | **138.2 KiB** | **117.1 KiB** |
| **Triiiceratops** | 1.0.0-rc.36, working tree | self-contained element JS | 521.7 KiB | **160.0 KiB** | **131.9 KiB** |
| Universal Viewer | 4.4.2 | bootstrap + image-viewer chunks | 1.75 MiB | **501.4 KiB** | **349.7 KiB** |
| Clover IIIF | 3.11.0 | self-contained web-component JS | 2.03 MiB | **608.6 KiB** | **504.9 KiB** |
| Mirador | 4.1.0 | self-contained JS | 2.32 MiB | **697.2 KiB** | **545.0 KiB** |

Exact byte counts:

| Viewer | Raw bytes | gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| TIFY | 541,485 | 141,467 | 119,874 |
| **Triiiceratops** | 534,170 | 163,863 | 135,033 |
| Universal Viewer | 1,831,630 | 513,473 | 358,120 |
| Clover IIIF | 2,127,423 | 623,250 | 516,989 |
| Mirador | 2,430,874 | 713,937 | 558,083 |

## Takeaway

Triiiceratops is in the small, self-contained group. Its gzip payload is about
16% larger than TIFY's, 68% smaller than Universal Viewer's image-session code,
74% smaller than Clover's, and 77% smaller than Mirador's. It is actually 1.4%
smaller than TIFY before compression; TIFY's bundle compresses better.

Universal Viewer's `UV.js` and CSS alone are only 66.0 KiB gzip, but that is a
loader, not a usable viewer. A cold image session also fetched two bootstrap
chunks, five image-viewer chunks, and an English translation chunk. AV-specific
chunks were not fetched or counted.

The requested `Tiiify` is listed by its canonical project name, **TIFY**.

## Method

- Selected the latest non-prerelease npm package available on the measurement
  date for each competitor.
- Followed each project's official plain-HTML embedding instructions.
- Counted the self-contained JS and CSS for Triiiceratops, TIFY, Clover, and
  Mirador. For code-split Universal Viewer, loaded an ordinary IIIF Image API
  manifest through its official `uv.html` embed in Chromium and counted every
  package JS/CSS/translation chunk fetched through image-viewer readiness.
- Excluded source maps, host HTML, manifests, images and tiles, external
  configuration files, fonts, plugins, and optional media-specific assets.
  Universal Viewer's fetched English translation is included because it is a
  required code chunk; external translations not fetched in the measured default
  session are excluded.
- Measured raw file bytes, gzip level 9, and Brotli quality 11. Multi-file totals
  are the sum of files compressed separately, matching separate HTTP responses.
- Built Triiiceratops from working tree commit `1cb6c5fe0c46` with
  `pnpm build:lib && pnpm build:element`. Its official custom-element embed needs
  only `dist/triiiceratops-element.iife.js`; component CSS is injected into the
  shadow root.

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

A source-mapped reporting build attributed all 534,170 minified bytes across
315 rendered modules. There were zero OpenSeadragon, Annotorious, Manifesto, or
`@iiif/*` modules. OpenSeadragon remains installed in this workspace only through
the separate annotation-editor package; it is not reachable from the core IIFE.

The largest attributable parts of the core IIFE are:

| Category | Approximate minified raw bytes |
| --- | ---: |
| Viewer components and chrome | 127,723 |
| Svelte runtime | 67,874 |
| Embedded icons | 51,611 |
| Viewer state | 50,029 |
| DOMPurify | 29,546 |
| First-party renderer | 25,771 |
| Compiled locale messages | 19,398 |

Generated glue and inline assets, including shadow-root CSS, account for much of
the remainder. These categories are source-map attributions, so their compressed
sizes are not independently additive.

### Why TIFY is smaller after compression

TIFY does include the Vue 3.5.27 production runtime, OpenSeadragon, and its CSS.
A source-mapped rebuild attributes about 65,883 minified raw bytes to Vue and
277,682 bytes to OpenSeadragon. Triiiceratops similarly includes about 67,874 raw
bytes of Svelte runtime, so the framework runtime is roughly a wash rather than
a cost unique to TIFY.

TIFY is 7,315 bytes larger before compression. Its 61,381-byte CSS file shrinks
to only 7,008 bytes gzip, and its OpenSeadragon, Vue, and generated component
patterns are highly repetitive. TIFY therefore compresses to 26.1% of raw size,
while Triiiceratops compresses to 30.7%. That compression behavior reverses their
raw ordering; it does not mean Triiiceratops contains OpenSeadragon or more raw
code.

The compression measurement can be reproduced with Node:

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

## Sources and selected artifacts

- Triiiceratops: [official integration guide](integration.md#any-framework-web-component),
  [`package.json`](../packages/core/package.json), and
  [`vite.config.element.ts`](../packages/core/vite.config.element.ts). Measured
  `packages/core/dist/triiiceratops-element.iife.js` locally.
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

## Caveats

- This measures transfer size, not parsed size, memory, startup time, or fetched
  IIIF content.
- Feature sets differ substantially. Core-only Triiiceratops excludes its
  separately shipped plugins, just as optional integrations and runtime media
  are excluded elsewhere.
- Packaging differs substantially too. Triiiceratops compiles all core locales
  into its IIFE, while TIFY keeps non-English translations in external JSON.
- Universal Viewer benefits from code splitting: this measures only code needed
  by the image path. The self-contained viewers also transfer baseline features
  that the selected session may not exercise.
- Clover also publishes a 15,607-byte raw stylesheet, but its official vanilla
  embed and plain-HTML fixture do not load it. Including it raises Clover to
  629,697 gzip bytes and does not change the conclusion.
- CDN compression can differ from these deterministic local compression levels.
