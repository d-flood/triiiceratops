# @triiiceratops/plugin-annotation-editor

> **Paused. Annotation editing is unavailable in this release of `triiiceratops`,
> and this package is no longer published.** It returns with the phase-2 drawing
> layer. The package is paused, not deleted — the domain machinery below is
> intact and is the starting point for that work.

## What happened

The viewer's renderer is first-party now. `triiiceratops` used to hand out the
raw OpenSeadragon viewer instance as public state (`ViewerState.osdViewer`,
gated by the `osd@5` runtime capability); it does not any more, and nothing
replaces it **as an object**. In its place core exposes a first-party viewport
API — viewport commands, query-only per-frame reads, and
`canvasToScreen`/`screenToCanvas` coordinate helpers.

This plugin's editing surface is
[`@annotorious/openseadragon`](https://www.npmjs.com/package/@annotorious/openseadragon),
whose integration is constructed **from** that raw instance and drives it
directly: `world.getItemAt(0)`, `viewport.pointFromPixel`,
`viewer.element.classList`, and OpenSeadragon's own event names. There is no
member of the new API to pass it instead, so there is no partial path here — the
plugin does not degrade, it stops.

**No compatibility shim was built, deliberately.** Reconstructing the ~14
viewport/world methods and 6 events Annotorious needs would be a week of work
for no user-visible gain, and would rebuild exactly the coupling to a third
party's object model that removing the pass-through was for. A shim built as
temporary becomes permanent the moment phase 2 slips.

## Last working combination

| Package                                   | Version                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `@triiiceratops/plugin-annotation-editor` | `1.0.0-rc.7` (the last published version)                                                         |
| `triiiceratops`                           | `1.0.0-rc.36` — the last core release carrying `ViewerState.osdViewer` and the `osd@5` capability |
| `@triiiceratops/plugin-sdk`               | `1.0.0-rc.6`                                                                                      |

Nothing newer than `triiiceratops@1.0.0-rc.36` can run this plugin. `1.0.0-rc.7`
is the last version that reached npm and is the only one you can install; the
in-repo version may advance along the same `1.0.0-rc` line as pauses and fixes are
recorded, but nothing after `rc.7` is published. The next version anyone can
install is the phase-2 one.

> **If you already depend on `1.0.0-rc.7`:** its published `triiiceratops` peer
> range is `^1.0.0-rc.33`, which npm will happily satisfy with a core that
> cannot run it. Hold core at `1.0.0-rc.36` for as long as you need annotation
> editing, and take the core upgrade when the phase-2 layer lands.

## What you see if you register it anyway

Activation **fails closed, and diagnosably by design**: the plugin still
declares the `osd@5` capability, which core retired with no successor, so
registering it produces a structured `PluginCompatibilityError` naming the
missing capability on core's plugin-error channel. In the viewer you see
_nothing_ — no button, no error state; per ADR 0010 plugin failures degrade
silently and observability is the channel, not UI. Watch `pluginerror` (or the
debug-gated logger) to see it.

That is the point of keeping the declaration. Dropping it would make the plugin
activate cleanly and install a toolbar button and panel whose "Edit" does
nothing at all, with no error anywhere — a silent failure instead of a
diagnosable one.

## What comes back, and on what

Phase 2 rebuilds the editing surface on core's own primitives rather than on a
third-party viewer object:

- **The paint hook** — the per-frame drawing seam plugins render overlays and
  handles through, in place of Annotorious's OpenSeadragon layer.
- **The input-claim API** — how a plugin takes pointer input for a drag (drawing
  a region, dragging a handle) without fighting the viewer's own pan and zoom.
- **`canvasToScreen` / `screenToCanvas`** — already shipped. Annotation geometry
  is persisted in canvas space, so these are the conversions the drawing layer
  needs, with the canvas/image conversion staying inside core.

Everything in `src/` that is _not_ the Annotorious binding is unaffected and
carried forward: the `AnnotationStore`, the `AnnotationStorageAdapter` seam and
its `LocalStorageAdapter`, the v1 LocalStorage namespace and the persisted W3C
annotation format, persistence-aware undo/redo, the body-editor API, the i18n
catalog, and the adapter conformance suite exported from
`@triiiceratops/plugin-annotation-editor/testing`.

## Repository notes

- **The package is `private: true` — unpublished, not removed.** It stays in the
  workspace and its `build`, `check`, `test`, `lint`, and `test:coverage` scripts
  all still pass, so it stays in the workspace's aggregate scripts too: the build
  is unbroken, it is the runtime that has no renderer to attach to.
- Unpublishing was chosen over pinning the `triiiceratops` peer range because the
  pin is not expressible. `test-consumers/driver/assert-tarball-contents.mjs`
  requires every published peer range to be a `^`/`~` range (never an exact pin),
  and no caret or tilde range admits `1.0.0-rc.36` while excluding `1.0.0`.
- `private` is the declarative statement, and it is what stops
  `changeset publish` and `scripts/audit-prod.mjs`. npm enforces it for tarball
  publishes too — `libnpmpublish` rejects any manifest with `private: true`
  outright — so nothing can push this package to the registry by accident.
- Removing it from `PUBLISHABLE_PACKAGES` in `scripts/release/packages.mjs` is
  still load-bearing, for a different reason than "npm would otherwise publish
  it". `.github/workflows/publish.yml` promotes tarballs in a loop under
  `set -euo pipefail`, driven by the release manifest generated from that list,
  with `triiiceratops` first. Leaving a package we don't intend to publish in the
  list would pack it, then fail EPRIVATE partway through — aborting the job with
  core already published, its registry smoke never run, and no GitHub release
  cut. The list must name exactly what we intend to promote.
- The manifest still carries `publishConfig: { access: "public", provenance: true }`
  above `private: true`. That is inert while the package is private, and kept on
  purpose: those are the settings this package must publish under when phase 2
  unpauses it, and deleting them would make the restoration a two-step change
  where forgetting the second step ships an unprovenanced tarball. `private` is the
  switch; `publishConfig` is the standing configuration behind it.
- `src/conformance.test.ts` no longer runs `runPluginConformance`. That suite
  mounts a plugin against a real viewer, and every lifecycle contract it asserts
  is downstream of an activation that now correctly never happens; the file pins
  the failure instead.
- Do not add a compatibility shim for the removed pass-through. See "What
  happened" above.
