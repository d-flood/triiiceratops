# Slice 06 — Plugin-owned display sync (adapters become pure storage)

- **Phase:** 2 (Adapter API v2)
- **Status:** not started
- **Depends on:** slice-05
- **Findings:** F10, F11 (display-state part)
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §2.1

## Goal

A custom adapter written exactly like the docs example must display its annotations.
Today `LocalStorageAdapter.load()` side-effects
`manifestsState.setUserAnnotations(...)` and custom adapters that don't replicate this
render nothing. The **plugin** (store + loader) owns display sync; adapters become pure
storage.

## Files

- `src/lib/plugins/annotation-editor/AnnotationStore.svelte.ts`
- `src/lib/plugins/annotation-editor/loader.svelte.ts`
- `src/lib/plugins/annotation-editor/adapters/LocalStorageAdapter.ts`
- `src/lib/plugins/annotation-editor/index.ts` (loader wiring)
- `docs/plugins.md` (fix the now-correct adapter example wording — full docs rewrite is
  slice-18, but the example must stop being misleading as of this slice)

## Implementation

1. `AnnotationStore` calls `manifestsState.setUserAnnotations(manifestId, canvasId,
   annotations)` after every successful `load`/`create`/`update`/`delete`, and
   `clearUserAnnotations` for canvases it populated on `destroy()` (track injected
   canvas keys in the store — move that bookkeeping out of `LocalStorageAdapter`).
2. `createLoader` takes the store (not the raw adapter): it loads *and* the store
   injects. The loader keeps its `lastLoadedId` dedupe.
3. Strip `manifestsState` entirely from `LocalStorageAdapter` — it shrinks to pure
   `localStorage` reads/writes and stands as the reference minimal adapter. Keep
   setting `__fullBodyLoaded = true` on load results (contract unchanged).
4. `createAnnotationEditorPlugin` constructs one store and shares it between the loader
   (`onInit`) and the controller/manager `props` — the store, not the adapter, is now
   the shared object. Keep accepting `config.adapter` exactly as before.
5. Back-compat note (CHANGELOG entry): adapters that still inject manually just get
   overwritten with identical data — harmless; recommend removing the injection.

## Tests

- Store test: `load` → `manifestsState.setUserAnnotations` called with the loaded
  annotations (mock `manifestsState`); same after `create`/`update`/`delete` with the
  updated set.
- Store `destroy()` → `clearUserAnnotations` for every canvas it populated,
  `adapter.destroy?.()` called.
- **The docs-example test:** an adapter object literal implementing only the five
  methods over an in-memory Map, passed through `createAnnotationEditorPlugin` →
  create + reload flow results in the annotation present in `manifestsState`.

## Acceptance

- Manual: paste the docs custom-adapter example (backed by an in-memory Map) into the
  demo — annotations display, edit, and delete correctly with zero `manifestsState`
  knowledge in the adapter.
- `LocalStorageAdapter.ts` contains no `manifestsState` import.

## Completion notes

_(fill in when done)_
