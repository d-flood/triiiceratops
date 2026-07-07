# Annotorious holds only the annotation being edited

Persisted annotations render through the lightweight read-only overlay
(`AnnotationOverlay`/`OSDViewer`), and the Annotorious instance is loaded with just the
one annotation currently open for editing (cleared on deselect). This keeps large
annotation sets cheap to render and keeps Annotorious's in-memory store from competing
with the adapter as a source of truth — the trade-off is that anything
selection-adjacent (undo/redo, styling of unselected annotations) cannot rely on
Annotorious and must be built plugin-side.
