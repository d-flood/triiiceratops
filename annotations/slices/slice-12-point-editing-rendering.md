# Slice 12 — Point editing representation & consistent rendering

- **Phase:** 3 (First-class IIIF points)
- **Status:** not started
- **Depends on:** slice-11
- **Findings:** F9 (real fix), F30 (`pointStyle` part)
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §3.2–§3.4

## Goal

Points look like points everywhere — read-only overlay, editing, and selection — with a
consistent, configurable marker; and editing a point without moving it is lossless.

## Files

- `src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts`
- `src/lib/plugins/annotation-editor/types.ts` (`pointStyle` config)
- `src/lib/components/OSDViewer.svelte` (`POINT_MARKER_SIZE` → configurable)
- viewer config plumbing for `pointStyle` (follow how `openSeadragonConfig` flows)
- tests

## Implementation

1. **Editing representation (§3.2).** Annotorious v3 has no point tool, so editing keeps
   a fragment-rect translation — make it presentational and lossless:
   - `toAnnotoriousTarget` sizes the rect in **screen pixels at selection time**
     (compute image-units-per-screen-pixel the way the old `handlePointClick` did),
     so the marker has constant visual size regardless of image resolution/zoom.
   - Keep the exact point in `editingPointOrigin: Map<id, {x, y}>` (canvas-space).
     Converting back: if the rect wasn't moved, emit the origin verbatim (bit-identical
     round-trip); if it was dragged, take the rect center as the new point.
   - Keep hiding resize handles via `.point-selected`; drag-to-move must work.
2. **Styling without `formatter` (§3.3 / F9).** Use Annotorious v3's style-function form
   `(annotation, state) => DrawingStyle` for point-specific fill/stroke. Check the
   installed v3.7 for per-annotation class support (`className` or similar) — if it
   exists, prefer it over container-class CSS; otherwise keep the manager-toggled
   `.point-selected` class for the `rx` rounding + handle hiding. Delete the vendored
   `point-annotation` CSS block that never matched.
3. **Unified marker config (§3.4).** New config:

   ```ts
   pointStyle?: { radius?: number; fill?: string; stroke?: string; strokeWidth?: number }
   ```

   Consumed by both the read-only overlay (`OSDViewer.svelte` — replace the
   `POINT_MARKER_SIZE = 10` constant; thread through viewer config with the current
   value as default) and the editor styling, so a point looks the same selected or not.
   Keep hit-testing (`pointInPolygon`/POINT radius check in OSDViewer) in sync with the
   configured radius.

## Tests

- Round-trip: load `PointSelector` → select → deselect without moving → saved selector
  is **identical** (regression for center-derivation drift).
- Drag: select → simulate rect move → saved selector reflects the new center.
- `toAnnotoriousTarget` produces a rect matching the configured screen-pixel size for
  two different zoom levels (mock viewport conversions).
- OSDViewer marker size honors `pointStyle.radius` (component-level or unit on the
  geometry computation).

## Acceptance

- `pnpm exec vitest run` (plugin + `OSDViewer`-related suites) green; `pnpm check`.
- Manual: a selected point renders as a circular marker of the same size as unselected
  points, at any zoom; select→save without moving produces no diff in storage.

## Completion notes

_(fill in when done)_
