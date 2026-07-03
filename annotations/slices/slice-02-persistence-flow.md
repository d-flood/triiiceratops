# Slice 02 — Persistence flow: persist drafts, save once, stop re-loading

- **Phase:** 1 (Correctness & lifecycle)
- **Status:** not started
- **Depends on:** slice-01
- **Findings:** F2, F3, F4, F14, F20 (partial — cache-before-await ordering)
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §1.2, §1.3, §1.8

## Goal

One user action → exactly one adapter call, and what the host's `prepareDraft` produced
is what gets persisted. Kill the per-save `adapter.load()` round-trip and the
canvas-change load race.

## Files

- `src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts`
- `src/lib/plugins/annotation-editor/AnnotationManager.test.ts`

## Implementation

1. **Persist the prepared draft (F2).** In the `createAnnotation` handler, persist the
   result of `prepareAnnotation(annotation)` (already canvas-space + draft-enriched),
   not the raw event payload. Add a `persistCreate(prepared)` path that skips the
   image→canvas re-transform (`saveAnnotation` assumes image-space input; the prepared
   clone is already canvas-space). `extension.beforeSave` still runs last.
2. **Suppression guard (F3).** Add `private suppressPersistence = false` and a
   `withSuppressedPersistence(fn)` helper; the `createAnnotation`/`updateAnnotation`
   (and later `deleteAnnotation`) event handlers early-return while it is set.
   `updateAnnotationBodies` persists once via the adapter, then updates Annotorious
   inside the guard so the echoed `updateAnnotation` event does not re-save.
3. **Cache-based create-vs-update (F4).** `saveAnnotation` decides via
   `persistedAnnotations.has(id)` — remove the `adapter.load()` call. Move the
   `persistedAnnotations.set(...)` to **after** the adapter call succeeds (rollback
   proper comes in slice-08; correct ordering starts here).
4. **Per-id save queue.** Keep a `Map<string, Promise<void>>` chaining saves per
   annotation id so rapid saves cannot interleave create/update for the same id.
5. **Load-race token (F14).** `private loadSequence = 0`; increment on each
   `loadAnnotations()` entry, discard results if the token changed after `await`. Apply
   the same current-canvas/current-selection re-check in `hydrateAnnotation` after its
   `await` (it already checks `stillPresent`; keep that).

## Tests

(mock adapter with call recording; fake timers or deferred promises for the race tests)

- Draw event with `extension.prepareDraft` adding a body → adapter `create` called
  exactly once, with the enriched body, in canvas space.
- `updateAnnotationBodies` → exactly one `update`, zero extra `create`/`update` from the
  echoed Annotorious event.
- Two rapid saves of the same annotation → serialized: first resolves before second
  starts; final adapter state is the second payload.
- Slow `load` for canvas A resolving after navigation to canvas B → cache contains
  canvas B's annotations only.

## Acceptance

- New tests pass; `pnpm exec vitest run src/lib/plugins/annotation-editor` green.
- Manual: with devtools network/console instrumentation on a logging adapter, one draw =
  one `create`; one Save Changes = one `update`.

## Completion notes

_(fill in when done)_
