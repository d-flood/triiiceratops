---
'triiiceratops': major
---

**OpenSeadragon is gone. The viewer ships one renderer, and it is first-party.**

`openseadragon` and `@types/openseadragon` have left `triiiceratops`'s runtime
`dependencies`, and the package's only remaining runtime dependency is
`dompurify`. The old renderer component, its tile-source and layout helpers, and
the development-only build flag that kept the two renderers side by side
(`globalThis.__TRIIICERATOPS_CANVAS_RENDERER__`, its Vite `define`, and the
`build:lib` step that folded it into the published tarball) are all deleted.
There is no renderer selection: no environment variable, no config option, and
no capability chooses a renderer, because there is only one (ADR 0012).

**What this costs a consumer.** Nothing that was still public. The renderer
pass-through (`ViewerState.osdViewer`) and the `osd@5` capability were removed
earlier in this line, replaced by the first-party viewport API — viewport
commands, query-only per-frame reads, `canvasToScreen`/`screenToCanvas`, and the
paint hook. This release removes only what was already unreachable: the
dependency, the flag, and the second implementation.

**Size.** The self-contained element IIFE is **534,162 bytes**, down from
**820,406** before the swap — 286,244 bytes (34.9%) smaller, and no
OpenSeadragon chunk to gzip. `perf-budgets.json` is re-captured from a
post-deletion build, and reproducing it needs no build flag: an ordinary
`build:element` is now the only build there is.

**Still paused:** `@triiiceratops/plugin-annotation-editor`. Its editing surface
is built on Annotorious's OpenSeadragon integration, so it keeps its own
`openseadragon` dependency and its unsatisfiable `osd@5` declaration for as long
as it is unpublished. Registering it against this core fails activation with a
structured `PluginCompatibilityError`, by design. See that package's `README.md`.
