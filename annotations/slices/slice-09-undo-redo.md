# Slice 09 — Persistence-aware undo/redo

- **Phase:** 2 (Adapter API v2)
- **Status:** not started
- **Depends on:** slice-08 (uses the store's rollback/apply machinery)
- **Findings:** F6 (final resolution; UI was removed in slice-04 per decision D1)
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §1.7

## Goal

Reintroduce undo/redo as a store-owned operation stack that replays inverses **through
the adapter**, so the visual state and storage always agree (the old Annotorious-backed
version resurrected deleted annotations on reload).

## Files

- `src/lib/plugins/annotation-editor/AnnotationStore.svelte.ts`
- `src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts`
- `src/lib/plugins/annotation-editor/AnnotationEditorController.svelte` /
  `AnnotationEditorPanel.svelte` (restore the buttons)
- tests

## Implementation

1. Each successful persisted op pushes its inverse onto an undo stack:
   - `create → delete(id)`
   - `update → update(previousCachedCopy)`
   - `delete → create(deletedCopy)`
2. `undo()`/`redo()` pop and replay through the normal store paths (so display sync,
   id reconciliation, and error rollback all apply). A replayed op pushes onto the
   opposite stack. Suppress stack-pushing while replaying.
3. Watch id reconciliation: undoing a `create` whose id was rewritten by the server
   must delete the **canonical** id; redo of that create may receive a *new* server id —
   re-reconcile.
4. Cap depth at 50; clear both stacks on canvas change and destroy.
5. Expose `canUndo`/`canRedo` as reactive store state; controller/panel re-add the
   buttons (they were removed in slice-04). Buttons live outside create-mode gating —
   undo of a delete is meaningful in edit mode too.
6. If the annotation affected by undo/redo is currently open in Annotorious, refresh or
   clear the editing session to match.

## Tests

- create → undo → adapter `delete` called, cache/`manifestsState` empty → redo →
  re-created (fresh reconciliation honored).
- update → undo → adapter receives the previous copy verbatim.
- delete → undo → annotation restored via `create`.
- Undo after server-id rewrite deletes the canonical id.
- Failed replay (adapter rejects) → stacks left consistent (op not lost), error surface
  fires.
- Canvas change clears both stacks.

## Acceptance

- `pnpm exec vitest run src/lib/plugins/annotation-editor` green.
- Manual: create + delete + undo + reload — storage matches what is on screen at every
  step.

## Completion notes

_(fill in when done)_
