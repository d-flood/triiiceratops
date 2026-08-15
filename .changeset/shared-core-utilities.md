---
'@triiiceratops/plugin-av': minor
'triiiceratops': minor
---

Publish a curated set of core's own utilities on the browser-runtime namespace, and have `@triiiceratops/plugin-av`'s IIFE read them instead of bundling a second copy.

`window.Triiiceratops` gains a third curated member beside `svelte` and `svelteInternal`: `core`, typed by the new public `SharedCoreUtils` and filled by the two Web Component entries with exactly four functions — `getPaintingAnnotations`, `isImageBody`, `paintingBodyAlternatives` and `isUnsupportedCanvasFor`. It is an empty object until core loads, exactly as the Svelte members are. Nothing is exported from the `triiiceratops` package entry that was not exported before: this is a browser-runtime member for script-tag consumers, and the ESM path goes on importing these functions normally.

It is the same first-party-only privilege as the shared Svelte runtime, granted the same way and fenced by the same three rules: the list is curated and never `export *`; growth is gated by the size ratchet, because every function on it is already retained by core's shipped graph and one that is not would move the element baseline; and version skew fails closed twice. Third-party plugins keep bundling their own copies of core's utilities, and `docs/plugin-authoring.md` now says so explicitly and says why the exception exists.

The plugin's bundling contract changes with it. Its IIFE now leaves `triiiceratops`'s package entry external and maps it to `window.Triiiceratops?.core`, which takes `dist/iife.js` from 21,882 to 21,402 gzip bytes — the painting classifier and the IIIF parsing helpers were being shipped a second time to a page whose core script had already parsed them. Core grew 131 gzip bytes. The pair now measures 140,369 gzip against TIFY's 141,467. Core's subpath entries are deliberately not externalized: they are not on the namespace, so they stay bundled. The ESM build is unchanged — `triiiceratops` was already an ordinary external peer there for a consumer's bundler to dedupe.

Skew fails closed in both places, because a compiled module dereferences these at load, long before activation could refuse anything. The plugin requires the new capability, so an older core refuses it with a `PluginCompatibilityError` naming `shared-core-utils`; and the IIFE's own gate, which runs ahead of its first module statement, names the missing utilities and returns without registering rather than throwing `is not a function` from module scope.

Plugin API 1.2.0 → 1.3.0: core declares a fourth capability, `shared-core-utils`.
