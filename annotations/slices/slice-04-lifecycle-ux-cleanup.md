# Slice 04 — Lifecycle & UX cleanup

- **Phase:** 1 (Correctness & lifecycle)
- **Status:** not started
- **Depends on:** slice-02
- **Findings:** F6 (interim), F9 (dead option only), F11, F12, F13, F22, F24, F25, F27
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §1.6, §1.7, §1.9
- **Decision applied:** D1 — remove undo/redo UI now; persistence-aware rebuild in slice-09.

## Goal

No leaked handlers or state after teardown, no misleading controls, no timing guesses,
no project-specific or untranslated strings.

## Files

- `src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts`
- `src/lib/plugins/annotation-editor/AnnotationEditorController.svelte`
- `src/lib/plugins/annotation-editor/AnnotationEditorPanel.svelte`
- `src/lib/plugins/annotation-editor/adapters/types.ts`
- `messages/en.json`, `messages/de.json`

## Implementation

1. **Remove viewer handlers on destroy (F12).** `init()` keeps references to its `open`
   and `canvas-click` handlers; `destroy()` calls `viewer.removeHandler(...)` for both,
   then nulls `osdViewer`.
2. **Call `adapter.destroy?.()` (F11)** from `AnnotationManager.destroy()`. Also clear
   `persistedAnnotations` and the hydration map there.
3. **Handle Annotorious `deleteAnnotation` (F27).** Wire the event; inside the
   slice-02 `suppressPersistence` guard semantics: our own `clearAnnotations()` calls
   must not trigger adapter deletes, but a genuine Annotorious-originated deletion of
   the actively edited annotation syncs `adapter.delete` + cache + selection state.
4. **Cancel-delete keeps the session (F13).** Remove `manager?.cancelSelection()` from
   `handleCancelDelete` in the controller — Cancel returns the user to editing.
5. **Remove undo/redo (F6, interim — D1).** Delete the undo/redo buttons from the
   panel, the `canUndo/canRedo/onUndo/onRedo` props/state plumbing, and the manager's
   Annotorious-backed `undo()/redo()/updateUndoRedoState()`. Keep the
   `onUndoRedoChange` callback signature out entirely (slice-09 reintroduces a
   persistence-aware version). Shipping controls that resurrect deleted data on reload
   is worse than not having them.
6. **Dead `formatter` option (F9, partial).** Delete the `formatter` key from the
   `createOSDAnnotator` config — it is Annotorious v2 API, ignored by v3. (The real
   point-styling replacement is slice-12; do not attempt it here.)
7. **Remove `apatopwa` (F22)** from `W3CAnnotation` in `adapters/types.ts`.
8. **i18n (F24).** Replace the hardcoded "Loading the full annotation text..." with a
   paraglide message (add to `messages/en.json` and `messages/de.json`, e.g.
   `annotation_editor_hydrating`).
9. **Timing hardening (F25).**
   - Init: replace the `setTimeout(..., 250)` after `open` with `requestAnimationFrame`
     (double-rAF if a single frame proves insufficient) — event-driven, not duration.
   - `handlePointClick`: call `setSelected(id)` immediately after `addAnnotation`; v3
     state is synchronous. If selection visibly fails, fall back to one rAF — never a
     magic duration. Same for `selectAnnotationById`'s `setTimeout(0)`.

## Tests

- `destroy()` removes both viewer handlers (spy on `viewer.removeHandler`) and calls
  `adapter.destroy`.
- Annotorious-originated delete → one `adapter.delete`, cache entry removed; plugin's
  own `clearAnnotations()` → zero adapter calls.
- Controller: cancel-delete leaves `selectedAnnotation` intact (component or handler
  unit test).

## Acceptance

- `pnpm exec vitest run src/lib/plugins/annotation-editor`, `pnpm check`, `pnpm lint`
  all green (paraglide message compile happens via `build:lib`; running `pnpm check`
  catches missing message references).
- Manual: create → select → trash-icon → Cancel → body editor still open with the same
  annotation. Point click selects the new point with no visible delay.

## Completion notes

_(fill in when done)_
