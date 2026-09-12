# Annotorious holds only the annotation being edited

!!! note "Superseded in premise by ADR 0021; the conclusion stands"

    Annotorious is gone — the editing surface is first-party. The split below is kept,
    but not for the reason given here: there is no third-party store left to compete
    with the adapter, and the reason the editor draws only the annotation under edit is
    that core's shapes are the accessible, focusable, labelled targets and duplicating
    them would mean two tab stops and two accessible names per annotation. Read
    "Annotorious" below as "the drawing layer".

Persisted annotations render through the lightweight read-only overlay
(`AnnotationOverlay`/`OSDViewer`), and the Annotorious instance is loaded with just the
one annotation currently open for editing (cleared on deselect). This keeps large
annotation sets cheap to render and keeps Annotorious's in-memory store from competing
with the adapter as a source of truth — the trade-off is that anything
selection-adjacent (undo/redo, styling of unselected annotations) cannot rely on
Annotorious and must be built plugin-side.
