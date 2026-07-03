# Slice 08 — Error surface, rollback, and user feedback

- **Phase:** 2 (Adapter API v2)
- **Status:** not started
- **Depends on:** slice-05, slice-06, slice-07
- **Findings:** F20
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §2.5

## Goal

Adapter failures are never invisible: hosts get a structured callback with a retry
handle, optimistic changes roll back, and without a host handler the panel shows a
dismissible error line.

## Files

- `src/lib/plugins/annotation-editor/types.ts` (`onPersistenceError` config)
- `src/lib/plugins/annotation-editor/AnnotationStore.svelte.ts`
- `src/lib/plugins/annotation-editor/AnnotationEditorController.svelte` /
  `AnnotationEditorPanel.svelte` (error line UI)
- `messages/en.json`, `messages/de.json` (error strings)
- tests

## Implementation

1. **Config hook:**

   ```ts
   onPersistenceError?: (error: {
     op: 'load' | 'create' | 'update' | 'delete' | 'hydrate';
     annotationId?: string;
     manifestId: string;
     canvasId: string;
     cause: unknown;
     retry: () => Promise<void>;   // re-runs the exact failed operation
   }) => void;
   ```

2. **Rollback in the store.** Apply cache + `manifestsState` changes optimistically,
   snapshot the previous state per operation, and restore it if the adapter rejects:
   - failed `create` → remove the optimistic entry (and clear the open Annotorious
     annotation if it was the one being created);
   - failed `update` → restore the previous cached copy and re-signal selection so the
     panel doesn't show phantom state;
   - failed `delete` → restore the entry.
3. **Default feedback.** Without `onPersistenceError`: `console.error` (keep) **plus** a
   small dismissible error line in the panel (i18n'd, with the failed operation), reset
   on the next successful operation or canvas change.
4. The per-id save queue (slice-02) must not deadlock on rejection — a failed save
   clears its queue slot.

## Tests

- Each op (`create`/`update`/`delete`) with a rejecting adapter: callback receives the
  right `op`/`annotationId`; cache and `manifestsState` match pre-operation state;
  `retry()` re-invokes the adapter with the same payload and, on success, applies
  normally.
- Failed `update` mid-edit → `onSelectionChange` re-fired with the rolled-back copy.
- No handler configured → panel error state set (controller-level assertion).
- Queue continues accepting saves after a rejection.

## Acceptance

- `pnpm exec vitest run src/lib/plugins/annotation-editor` green, `pnpm check`,
  `pnpm lint` clean.
- Manual: demo adapter that fails every other call — UI shows the error line, the
  annotation list stays consistent, retry works.

## Completion notes

_(fill in when done)_
