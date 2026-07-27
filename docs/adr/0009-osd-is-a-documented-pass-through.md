---
search:
  exclude: true
---

# The OpenSeadragon viewer is a documented pass-through, pinned to core majors

`osdViewer: OpenSeadragon.Viewer | null` is documented observable state (set at OSD
readiness) rather than hidden or wrapped: three of four first-party plugins consume it
directly, and Annotorious's OSD integration requires the raw instance, so hiding it was
never viable. The semver split is the decision — the field's existence and ready-timing
are core API, while the object's own methods are OpenSeadragon's, governed by OSD's
versioning. The bundled OSD major is declared as a runtime capability (`osd@5`) that
plugins touching raw OSD must require, and upgrading the OSD major requires a core
major release. Full API adoption (making OSD's surface part of core's 1.x guarantee)
was rejected because it would block even security-driven OSD upgrades; swapping OSD
majors in a core minor was rejected because capability negotiation would then "cleanly"
deactivate every OSD-touching plugin on the page — a polite way to break them.
