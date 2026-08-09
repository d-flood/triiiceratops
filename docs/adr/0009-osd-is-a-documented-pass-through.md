---
search:
  exclude: true
---

# The OpenSeadragon viewer is a documented pass-through, pinned to core majors

**Superseded** by [ADR 0012](0012-the-renderer-is-first-party-with-no-pass-through.md).
The third-party renderer this ADR governs was replaced by a first-party Canvas2D
renderer; there is no pass-through to pin and no capability to negotiate. What follows
is the historical record of why the pass-through existed, kept because ADR 0012's
argument only makes sense against it.

`osdViewer: OpenSeadragon.Viewer | null` was documented observable state (set at OSD
readiness) rather than hidden or wrapped: three of four first-party plugins consumed it
directly, and Annotorious's OSD integration requires the raw instance, so hiding it was
never viable. The semver split was the decision — the field's existence and ready-timing
were core API, while the object's own methods were OpenSeadragon's, governed by OSD's
versioning. The bundled OSD major was declared as a runtime capability (`osd@5`) that
plugins touching raw OSD had to require, and upgrading the OSD major required a core
major release. Full API adoption (making OSD's surface part of core's 1.x guarantee)
was rejected because it would block even security-driven OSD upgrades; swapping OSD
majors in a core minor was rejected because capability negotiation would then "cleanly"
deactivate every OSD-touching plugin on the page — a polite way to break them.
