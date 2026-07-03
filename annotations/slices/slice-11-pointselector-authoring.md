# Slice 11 — Direct `PointSelector` authoring

- **Phase:** 3 (First-class IIIF points)
- **Status:** not started
- **Depends on:** slice-07 (stamping + temp-id reconciliation)
- **Findings:** F17, F18 (point part)
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §3.1
- **Decisions applied:** D2 — integer canvas px; D3 — keep fragment-center read-compat.

## Goal

The point tool creates a real IIIF `PointSelector` annotation at the exact click point —
no synthetic 2-screen-pixel fragment rectangle, no zoom-dependent geometry, no
`point-` id heuristics.

## Files

- `src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts`
- `src/lib/plugins/annotation-editor/AnnotationManager.test.ts`

## Implementation

1. **`handlePointClick` builds the real annotation:**

   ```ts
   const annotation = {
     '@context': 'http://www.w3.org/ns/anno.jsonld',
     id: `temp-${crypto.randomUUID()}`,          // replaced via slice-07 reconciliation
     type: 'Annotation',
     body: [],
     target: {
       type: 'SpecificResource',
       source: this.currentCanvasId,
       selector: { type: 'PointSelector', x, y }, // canvas-space
     },
   };
   ```

   Coordinates: click → viewport → image coords (existing OSD conversion) → canvas
   coords via `imagePointToCanvasPoint` + current dimensions; apply a single
   `Math.round` on the final canvas-space values (D2). No center-derivation, no
   screen-pixel sizing at creation time.
2. **Route through the store create path** so `prepareDraft`, stamping (slice-07), and
   display sync all apply — the same pipeline as drawn shapes. Then open it for editing
   (select), which uses `toAnnotoriousTarget` for the editor representation (improved in
   slice-12; the existing fixed-size conversion is acceptable within this slice).
3. **Simplify detection.** `isPointAnnotation` = `selector?.type === 'PointSelector'`
   (recursing into `selector.item` for wrapped selectors, matching
   `annotationAdapter.ts`). Delete the `id.startsWith('point-')` heuristic.
4. **Read-compat (D3).** Keep `getPointCoordinates`'s fragment-center fallback so
   previously stored odd data still resolves, but new writes never produce it. The
   save-time `toPointSelectorTarget` conversion becomes unnecessary for new points
   (they are already `PointSelector`) — keep it as a no-op pass-through for
   `PointSelector` targets.

## Tests

- Point click at a known position/zoom → adapter `create` receives
  `{type: 'SpecificResource', source: <canvas>, selector: {type: 'PointSelector', x, y}}`
  with integer `x`/`y` within 1 canvas px of the click; stamped per slice-07;
  `prepareDraft` body applied.
- Zoom invariance: same click point at 2 different zoom levels → identical stored
  selector (this was the F17 failure mode).
- `isPointAnnotation` true for `PointSelector` (direct and `selector.item`-wrapped),
  false for fragment rects — no id-prefix dependence.
- Update existing point-serialization tests to the new flow; keep a read-compat test
  feeding legacy `point-…` fragment data through `getPointCoordinates`.

## Acceptance

- `pnpm exec vitest run src/lib/plugins/annotation-editor` green.
- Manual (demo): create points at min and max zoom; inspect storage — exact
  `PointSelector`, integer coords; the point renders at the click location after reload.

## Completion notes

_(fill in when done)_
