---
'triiiceratops': patch
---

The self-contained custom element is now the smallest IIIF viewer measured, on
raw bytes, gzip, and Brotli at the same time.

`triiiceratops-element.iife.js` is **398,892 raw / 112,556 gzip / 93,052
Brotli**, down from 534,170 / 163,863 — 25.3% fewer raw bytes and 31.3% fewer
gzip bytes. The ESM registration entry, `triiiceratops/element/register`, is
417,502 / 118,456 / 98,271 and is now measured and published alongside it. For
context, TIFY — the nearest competitor — is 541,485 / 141,467 / 119,874. Nothing
is code-split; both entries remain single self-contained files.

Where the bytes went:

- DOMPurify was retired in favour of a first-party IIIF rich-text renderer,
  which removed ~29.5 KB raw and left core's runtime `dependencies` empty.
- A terser pass now runs after esbuild in both element builds.
- Scoped component CSS is minified. It lives in JS string literals, so it had
  never passed through the CSS pipeline; 30,493 bytes of it were comments.
- The icon table generates only the 43 glyph-and-weight entries the viewer
  renders, not all 144.
- The state inventory's review prose no longer ships as runtime data.
- Only the custom-element wrapper is compiled as a custom element.

The last four are build-level and change nothing you can see: every panel,
locale, theme, and icon the viewer renders is unchanged. Two product-visible
changes did arrive with the sanitizer replacement, both security fixes and both
described in their own changesets:

- **Search excerpts are rendered as text.** `SearchHit.before`, `match` and
  `after` are public API filled by any host-supplied `SearchProvider` or remote
  IIIF Content Search service, and they reached raw HTML sinks with no sanitizer
  at all — a hostile or compromised search service could execute script in the
  host page. Bare `<mark>` still highlights; any other markup a provider returns
  now renders as visible characters.
- **IIIF rich text is rebuilt from an allowlist.** `ul`/`ol`/`li` and `table`
  markup in a manifest loses its structure, and inline `style` is neither
  emitted nor read.

`docs/bundle-size-comparison.md` is restated against these artifacts, with every
competitor re-verified. A size gate (`pnpm size:check`) now measures both
element artifacts against a committed baseline on every `pnpm build:element`, so
the published figures and the enforced budget cannot drift apart.
