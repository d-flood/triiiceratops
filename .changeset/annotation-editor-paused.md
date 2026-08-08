---
'@triiiceratops/plugin-annotation-editor': patch
---

**Annotation editing is unavailable in this core release, and this package is no
longer published.** It returns with the phase-2 drawing layer. The package is
paused, not deleted. This is recorded as a patch so the in-repo version stays on
the `1.0.0-rc` line it was published from — `1.0.0-rc.7` remains the newest version
anyone can install, and no version recorded while the pause holds reaches npm.

**Why.** The viewer's renderer is first-party now: `ViewerState.osdViewer` and
the `osd@5` capability that gated it are gone, and nothing replaces the raw
OpenSeadragon viewer **as an object**. This plugin's editing surface is
`@annotorious/openseadragon`, whose integration is constructed from that
instance and drives it directly (`world.getItemAt(0)`,
`viewport.pointFromPixel`, `viewer.element.classList`, OpenSeadragon's own event
names). There is no member of core's new viewport API to hand it instead, so
this is not a degradation — it is a stop. No compatibility shim was built, on
purpose: reconstructing the ~14 viewport/world methods and 6 events Annotorious
needs is a week of work for no user-visible gain and would rebuild exactly the
coupling to a third party's object model that removing the pass-through was for.

**Last working combination.** `@triiiceratops/plugin-annotation-editor@1.0.0-rc.7`
against `triiiceratops@1.0.0-rc.36` — the last core release carrying
`ViewerState.osdViewer` and the `osd@5` capability — with
`@triiiceratops/plugin-sdk@1.0.0-rc.6`. Nothing newer than core `1.0.0-rc.36`
can run it. If you already depend on `1.0.0-rc.7`, note that its published
`triiiceratops` peer range is `^1.0.0-rc.33`, which npm will satisfy with a core
that cannot run it: hold core at `1.0.0-rc.36` for as long as you need
annotation editing.

**Registering it anyway fails loudly.** The plugin deliberately keeps declaring
`osd@5`, so activation produces a structured `PluginCompatibilityError` naming
the retired capability. Dropping the declaration would have installed a toolbar
button and panel whose "Edit" does nothing at all with no error anywhere — a
silent failure in place of a diagnosable one. `src/conformance.test.ts` pins
that failure rather than running `runPluginConformance`, which cannot mount a
plugin that correctly never activates.

**How the pause is enforced, and what was removed to enforce it.** `private: true`
on the package manifest is the declarative statement, and npm does enforce it —
`npm publish` refuses a private manifest with `EPRIVATE`, tarball or not. But a
hard failure mid-release is not a safety net: this project's pipeline promotes
prebuilt tarballs in one `set -euo pipefail` loop over a release manifest, core
first, so a package left in that manifest that we never intend to publish would
abort the job with core already on the registry, its smoke test never run and no
release cut. So the package was also removed from `PUBLISHABLE_PACKAGES` in
`scripts/release/packages.mjs`, the single source of truth for the publishable set,
which drops from six packages to five. Everything downstream derives from that list
rather than restating a count:
the pack step and its exactly-N-tarballs guard, the two-clean-build
reproducibility gate, the post-publish registry smoke (which installs exactly the
manifest's packages, and whose plugin-import loop is generated from it), and the
per-package production audit (which discovers the publishable set by skipping
`private` manifests). No release artifact for this package is produced, so none
can be promoted.

The packed-consumer harness also drops the `plugin-annotation-svelte` fixture: it
drove the full annotate journey through a real viewer, which cannot pass now that
activation fails by design. The plugin is still packed and still exercised where
no viewer is involved — the `plugin-annotation-conformance` fixture runs the
adapter suite from the `/testing` subpath, and `docs-examples` type-checks the
package's documented examples — so the surfaces listed below stay covered by real
tarball consumption.

**What is unaffected and carried forward** into phase 2, which builds the
editing surface on core's paint hook, input-claim API, and the shipped
`canvasToScreen`/`screenToCanvas` helpers: the `AnnotationStore`, the
`AnnotationStorageAdapter` seam and `LocalStorageAdapter`, the v1 LocalStorage
namespace and the persisted W3C annotation format, persistence-aware undo/redo,
the body-editor API, the i18n catalog, and the adapter conformance suite at
`@triiiceratops/plugin-annotation-editor/testing`. The package's `build`,
`check`, `test`, `lint`, and coverage scripts all still pass, so it stays in the
workspace's aggregate scripts; only the runtime has no renderer to attach to.
See the package README for the full disposition.
