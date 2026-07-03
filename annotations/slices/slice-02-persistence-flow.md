# Slice 02 — Persistence flow: persist drafts, save once, stop re-loading

- **Phase:** 1 (Correctness & lifecycle)
- **Status:** done (2026-07-03)
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

**What changed** (`AnnotationManager.svelte.ts`):

- **F2 — persist the prepared draft.** The `createAnnotation` handler now persists
  `prepareAnnotation(annotation)` (canvas-space, draft-enriched) via a new
  `persistCreate(prepared)` path that skips the image→canvas re-transform. `beforeSave`
  still runs last inside `persistCreate`. Event wiring was extracted into
  `handleCreateAnnotation` / `handleUpdateAnnotation` methods (the `on(...)` callbacks are
  now thin `void this.handleX(...)` shims) so the create/update flow is unit-testable
  without a live annotator.
- **F4 — cache-based create-vs-update + per-id serialization.** New single chokepoint
  `persist(w3cAnnotation)` decides create vs update from `persistedAnnotations.has(id)`
  (the per-save `adapter.load()` round-trip is gone) and chains writes per id through a
  `saveQueue` map so rapid saves of the same id can't interleave. The cache is now set
  **after** the adapter call resolves (correct ordering; full rollback is slice-08).
  `stripInternalMarkers` keeps `__fullBodyLoaded`/`__bodyPreview` out of adapter payloads
  and the cache.
- **F3 — single body save.** `updateAnnotationBodies` persists once via `saveAnnotation`,
  then pushes bodies back into Annotorious inside `withSuppressedEcho(id, …)` so the
  echoed `updateAnnotation` event doesn't re-save. Removed the redundant manual cache set.
- **F14 — load-race token.** `loadSequence` increments on each `loadAnnotations()` entry;
  a stale async load discards its result. Same token captured/compared across the await
  in `hydrateAnnotation` (its existing `stillPresent` check is kept).

**Tests** (`AnnotationManager.test.ts`): new `persistence flow` describe block — prepared
draft persisted once with enriched body in canvas space and no internal marker;
`updateAnnotationBodies` → one `update`, zero `create`, echo suppressed and consumed;
two rapid saves of one id serialize (create fully resolves before update starts, final
payload wins); a slow canvas-A load resolving after navigating to canvas B is discarded.
Added `fakeAnnotorious`, `flush`, and `SCALING_CANVAS` test helpers.

**Deviation (important — flagged into slice-04):** the plan's §1.3 boolean
`suppressPersistence` guard does **not** work, because Annotorious v3.7.19 dispatches all
lifecycle events asynchronously via `setTimeout(…, 1)` (verified in the installed
`@annotorious/core` dist) — a synchronous flag would be reset before the echo fires.
Implemented an id-scoped equivalent instead: `withSuppressedEcho(id, fn)` +
`consumeSuppressedEcho(id)`, with the mark consumed one-per-echo. Also confirmed a
body-change update emits exactly one echo (the body observer updates the tracked
selection array, so the selection tracker doesn't re-emit), so one mark == one echo.
Added a `⚠ Notes from slice-02` block to slice-04 covering this and correcting its
"v3 state is synchronous" claim (store state is sync; events are async). Additionally
noted while here: programmatic `addAnnotation`/`setAnnotations` use `Origin.REMOTE` and
therefore emit **no** `createAnnotation` lifecycle event — so hand-built point creation
(`handlePointClick`) never routes through the create handler (relevant to slices 11–12).

**Follow-ups:** rollback on adapter failure is deferred to slice-08 (cache is now set
after success, so a failed write no longer leaves a phantom cache entry — the F20-partial
ordering fix). `stripInternalMarkers` is a stopgap until slice-03 makes hydration state
fully manager-internal.

**Verification:** `pnpm exec vitest run src/lib/plugins/annotation-editor` (11 pass);
`pnpm exec vitest run` (324 pass); `pnpm check` (0 errors); `eslint` on the plugin dir
clean (used `SvelteMap`/`SvelteSet` for the new internal structures to satisfy the
project's `prefer-svelte-reactivity` rule). Manual logging-adapter check (acceptance
bullet 2) not performed in this headless run.
