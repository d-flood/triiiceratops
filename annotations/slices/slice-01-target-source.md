# Slice 01 — `target.source` correctness

- **Phase:** 1 (Correctness & lifecycle)
- **Status:** done (2026-07-03)
- **Depends on:** none
- **Findings:** F1, F26
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §1.1

## Goal

Annotations must always persist with `target.source` set to the canvas they were drawn
on. Today Annotorious's `W3CImageFormat` stamps the canvas id captured at init time into
every annotation it serializes, and `ensureTargetSource()` only fills in a *missing*
source — so anything drawn after canvas navigation persists with the wrong target. Also
eliminate the `'unknown'` source fallbacks.

## Files

- `src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts`
- `src/lib/plugins/annotation-editor/AnnotationManager.test.ts`

## Implementation

1. Rename `ensureTargetSource` → `forceTargetSource`. It must **always overwrite**
   `target.source` with `this.currentCanvasId`, preserving all other target fields.
   Handle both shapes: object target (overwrite `.source`) and string target (replace
   with `{ source: currentCanvasId }`). Within this plugin the target is by definition
   the current canvas, so overwriting is safe regardless of what the Annotorious
   serializer stamped.
2. Remove the `?? 'unknown'` fallbacks: `initAnnotorious` (`sourceId`, ~line 130),
   `toPointSelectorTarget` (~346–349), `toAnnotoriousTarget` (~373–376). After step 1
   the value passed to `W3CImageFormat` no longer matters for persisted output, but pass
   the real canvas id when available for cleanliness.
3. Guard against a null canvas: early-return in `handlePointClick` and skip enabling
   Annotorious native drawing in `updateDrawingMode` while `currentCanvasId === null`.
   Never let an annotation be created or persisted without a real canvas id.

## Tests

- Regression for F1: construct manager, set `currentManifestId`/`currentCanvasId` to
  canvas 1, `handleCanvasChange` to canvas 2, `saveAnnotation` with a target whose
  `source` is canvas 1 (simulating the stale serializer) → assert the adapter receives
  `target.source === <canvas 2 id>`.
- `saveAnnotation` with a string target → object target with current canvas source.
- Point click with `currentCanvasId === null` → no annotation created, no adapter call.

## Acceptance

- New tests pass; existing point-serialization tests still pass
  (`pnpm exec vitest run src/lib/plugins/annotation-editor`).
- Manual (demo app): open a multi-canvas manifest, navigate to canvas 2, draw a
  rectangle, inspect localStorage — the annotation's `target.source` is canvas 2's id.

## Completion notes

**What changed** (`AnnotationManager.svelte.ts`):

- Renamed `ensureTargetSource` → `forceTargetSource`; it now **always** overwrites
  `target.source` with `this.currentCanvasId`, preserving all other target fields.
  Object targets have `.source` overwritten; string targets (and a missing target) are
  replaced with `{ source: currentCanvasId }`. Updated all three call sites
  (`saveAnnotation`, `prepareAnnotation`, `updateAnnotationBodies`).
- Removed the `?? 'unknown'` fallbacks in `initAnnotorious` (`sourceId` is now
  `canvasId ?? ''`, and it no longer matters for persisted output since
  `forceTargetSource` overwrites on save), `toPointSelectorTarget`, `toAnnotoriousTarget`,
  and the hand-built annotation in `handlePointClick`.
- Null-canvas guards: `handlePointClick` early-returns when `currentCanvasId === null`;
  `updateDrawingMode` only enables Annotorious native drawing when `currentCanvasId`
  is non-null (`canDraw = enabled && currentCanvasId !== null`).

**Tests** (`AnnotationManager.test.ts`): added a `target.source correctness` describe
block — (1) F1 regression: init on canvas 1 → `handleCanvasChange` to canvas 2 → save an
annotation carrying the stale canvas-1 source → adapter receives `target.source ===
canvas 2`; (2) string target → object target with current canvas source; (3) point click
with `currentCanvasId === null` creates nothing and calls no adapter. Reorganized the
last existing test cleanly (no behavior change).

**Deviations:** none of substance. `initAnnotorious`'s `sourceId` uses `''` rather than
the literal `'unknown'` as the null fallback (value is irrelevant post-`forceTargetSource`).

**Verification:** `pnpm exec vitest run src/lib/plugins/annotation-editor` (7 pass);
`pnpm exec vitest run` (320 pass); `pnpm check` (0 errors); `pnpm lint` on the plugin dir
clean. The one repo-wide lint error (`src/lib/components/ui/Select.svelte:146`) is
pre-existing and untouched by this slice. Manual demo-app inspection of localStorage
(acceptance bullet 2) was not performed in this headless run — recommended before release.
