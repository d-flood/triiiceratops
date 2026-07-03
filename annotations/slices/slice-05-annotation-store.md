# Slice 05 — Extract the `AnnotationStore` (persistence core refactor)

- **Phase:** 2 (Adapter API v2)
- **Status:** not started
- **Depends on:** slice-01, slice-02, slice-03, slice-04
- **Findings:** none directly — enabling refactor for F5, F10, F18, F20
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §2.2

## Goal

Pull everything persistence-related out of `AnnotationManager` into an internal
`AnnotationStore` class so the manager only handles Annotorious/OSD mechanics. **No
behavior change** — this slice is a pure refactor gated by the existing test suite.

## Files

- `src/lib/plugins/annotation-editor/AnnotationStore.svelte.ts` (new)
- `src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts`
- `src/lib/plugins/annotation-editor/loader.svelte.ts` (constructor signature only if
  needed; behavior change is slice-06)
- `src/lib/plugins/annotation-editor/index.ts` (wire construction; store is internal,
  not exported)
- tests: move/adjust persistence tests to target the store where natural

## Implementation

Move into `AnnotationStore` (constructor takes the raw adapter + config):

- `persistedAnnotations` cache and the slice-03 `hydrationState` map
- create-vs-update resolution and the per-id save queue (slice-02)
- `loadSequence` race token
- `resolvePersistedAnnotation` / hydrate logic
- canvas-context (`currentManifestId`/`currentCanvasId`) — store owns it; manager reads
  it or is told via the same `handleCanvasChange` flow

Public store surface (internal to the plugin):

```ts
class AnnotationStore {
  setCanvas(manifestId: string | null, canvasId: string | null): Promise<void>;
  load(): Promise<W3CAnnotation[]>;
  get(id: string): W3CAnnotation | null;
  create(annotation: W3CAnnotation): Promise<W3CAnnotation>;   // returns canonical (slice-07)
  update(annotation: W3CAnnotation): Promise<W3CAnnotation>;
  delete(id: string): Promise<void>;
  hydrate(id: string): Promise<W3CAnnotation | null>;
  destroy(): void;                                              // calls adapter.destroy?.()
}
```

`AnnotationManager` keeps: Annotorious lifecycle, tool/drawing state, point handling,
selection, coordinate transforms (transforms stay at the manager/store boundary — the
store deals only in canvas-space annotations), and calls the store for all persistence.

## Tests

- Existing suite must pass unchanged (that is the point). Relocate slice-02/03 tests to
  the store where they test store behavior; keep manager-level integration tests that
  drive the store through the manager.

## Acceptance

- `pnpm exec vitest run src/lib/plugins/annotation-editor` green with no test deletions,
  `pnpm check` clean.
- `AnnotationManager.svelte.ts` no longer imports the adapter type directly for CRUD.

## Completion notes

_(fill in when done)_
