# Triiiceratops Glossary

Canonical vocabulary for the triiiceratops IIIF viewer. When code, docs, issues, or
conversation need one of these concepts, use the term defined here.

## Annotation domain

**Adapter**:
The host-supplied storage backend for annotations — a handful of pure persistence
functions (`load`/`create`/`update`/`delete`, optional `hydrate`). It stores and
retrieves; it has no display, id-bookkeeping, or stamping responsibilities.
_Avoid_: storage provider, backend, connector

**Store**:
The plugin-internal persistence layer that wraps the adapter and owns everything the
adapter must not: caching, create-vs-update resolution, display sync, id
reconciliation, stamping, and error rollback.
_Avoid_: cache (for the whole layer), repository

**Display sync**:
Making persisted annotations visible in the read-only overlay by injecting them into
the viewer's shared display state after each successful persistence operation. Owned by
the plugin, never by adapters.
_Avoid_: injection (alone, without saying what is injected where)

**Point annotation**:
An annotation whose target selector is a IIIF `PointSelector` — a single exact point on
a canvas, not a small region.
_Avoid_: marker, pin, point-ish rectangle

**Canvas space**:
Coordinates expressed in the IIIF canvas's own dimensions — the persistence format for
all annotation geometry.

**Image space**:
Coordinates expressed in the underlying image's pixel dimensions — what Annotorious and
OpenSeadragon work in. Converted to canvas space at the store boundary.

**Draft**:
The annotation as enriched by the host's `prepareDraft` extension hook before it is
first persisted. What the user sees in the panel and what gets saved must both be the
draft, never the raw drawn shape.

**Hydration**:
Fetching an annotation's full body on demand (typically at selection) when the adapter
returned only a skeleton from `load`.

**Skeleton**:
A partially loaded annotation whose body is a preview/stub pending hydration. A
skeleton body must never be saved over a full one.
_Avoid_: stub, partial (as nouns)

**Stamping**:
The plugin filling in required W3C annotation fields (`@context`, `type`, `creator`,
`created`/`modified`, `motivation`) before persistence, without clobbering
host-provided values.
_Avoid_: enrichment (that's what the host's draft hooks do)

**Reconciliation**:
Swapping the plugin's temporary annotation id for the canonical id the adapter's server
minted on create, everywhere at once (cache, display state, open editor, subsequent
calls).

**Canonical id**:
The server-assigned annotation IRI after reconciliation; the only id used for
subsequent `update`/`delete`.
_Avoid_: real id, server id (in code)

**Echo**:
The Annotorious lifecycle event re-emitted asynchronously after the plugin itself
programmatically mutates Annotorious state. Echoes are suppressed per annotation id so
they don't trigger duplicate persistence.

**Body editor**:
The UI inside the editor card that edits an annotation's bodies. Either the built-in
`{purpose, value}` editor or a host-supplied custom one; selection, deletion, and
persistence stay plugin-owned either way.
_Avoid_: annotation editor (that's the whole plugin)

**Extension**:
The host-provided hook object (`getContext`/`canCreate`/`prepareDraft`/`beforeSave`/
`onSelectionChange`/`subscribe`) through which a host application customizes plugin
behavior without forking it.
_Avoid_: plugin (that means the whole annotation-editor plugin), hooks object

## Plugin chrome

**Panel**:
A plugin render target: a full side/bottom panel in the viewer chrome.

**Flyout**:
A plugin render target: a popover anchored to its toolbar button, auto-placed toward
the canvas. The compact alternative to a panel.
_Avoid_: popup, popover (as the term of art)

## Relationships

- **Manager → Store → Adapter**: the manager (Annotorious/OSD mechanics) calls the
  store for all persistence; the store calls the raw adapter and performs display sync,
  stamping, and reconciliation around it.
- **Store → Overlay**: the store's display sync feeds the read-only overlay; Annotorious
  holds only the annotation currently being edited.
- **Host ↔ Plugin**: the host customizes via the extension (behavior), the body editor
  (body UI), and the adapter (storage).
