---
'@triiiceratops/plugin-annotation-editor': major
---

`@triiiceratops/plugin-annotation-editor` 1.0 — published again, rebuilt on
core's own primitives.

Its editing surface is a first-party drawing layer over an overlay layer —
rectangle, ellipse, polygon, point and whole-canvas tools, every one of them
operable from the keyboard for creation as well as editing — and
`@annotorious/annotorious`, `@annotorious/openseadragon` and `openseadragon` are
gone from its dependencies. Compatibility is a `coreRange` floor with no
`requiredCapabilities`: overlay layers are not optional in core, so there was
nothing to require.

**Breaking for anyone on `1.0.0-rc.7`:**

- `drawingStyle` is removed. It was typed with an Annotorious type and only ever
  read inside the deleted Annotorious binding. The drawing layer is DOM, styled
  by the `--tri-annotation-*` custom properties instead.
- `pointStyle` is removed from the plugin's config. It only ever styled the
  Annotorious marker, which is why it goes the way `drawingStyle` does. Nothing
  replaces it in configuration: a marker is theming now, and both core's
  read-only marker and this editor read the same two tokens —
  `--tri-annotation-point-size` and `--tri-annotation-color` — which is what
  makes a point the same size and colour selected and not. The plugin also stops
  re-exporting the `PointStyle` type.
- `user` keeps its `{ id, name }` shape but is a locally declared type rather
  than an Annotorious one. No call-site change: replace an `import type { User }
  from '@annotorious/openseadragon'` with `AnnotationEditorUser` from this
  package.
- The plugin's `:active-edit-id` window `CustomEvent` is removed, along with
  core's `triiiceratops:annotation-editor:request-edit`. Both were deprecated in
  `1.0.0-rc.36`, had no listener, and in-viewer edit coordination is the
  per-viewer `annotationEditBus` channel.

Nothing about persisted data changed. The v1 LocalStorage namespace and the W3C
annotation format are the same, so annotations written by `rc.7` load and edit
without migration — an ellipse simply was not drawable before.

Everything that was never the Annotorious binding is carried forward unchanged:
the store, the adapter seam and `LocalStorageAdapter`, display sync, stamping, id
reconciliation, hydration, persistence-aware undo/redo, the body editor and its
replacement hook, the extension hooks, the i18n catalog, and the adapter
conformance suite on the `/testing` subpath.
