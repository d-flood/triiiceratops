# Slice 15 — Reactive extension context + per-viewer event scoping

- **Phase:** 4 (Configuration & body editor)
- **Status:** not started
- **Depends on:** slice-04 (controller cleanup); independent of body-editor slices
- **Findings:** F15, F16
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §4.3, §4.4

## Goal

`canCreate`/`getCreateDisabledReason` re-evaluate when host state changes, and two
viewer instances on one page stop cross-talking through global `window` events.

## Files

- `src/lib/plugins/annotation-editor/types.ts` (extension `subscribe`)
- `src/lib/plugins/annotation-editor/AnnotationEditorController.svelte`
- `src/lib/state/viewer.svelte.ts` (edit bus)
- `src/lib/components/OSDViewer.svelte`
- `src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts`
- tests

## Implementation

1. **Extension invalidation (F16):**

   ```ts
   interface AnnotationEditorExtension<HostContext> {
     ...
     /** Subscribe to host-context changes; call the callback to re-evaluate
         canCreate / getCreateDisabledReason. Returns an unsubscribe. */
     subscribe?: (invalidate: () => void) => () => void;
   }
   ```

   Controller: `let contextVersion = $state(0)`; on mount, `extension.subscribe?.(() =>
   contextVersion++)` (unsubscribe on destroy); read `contextVersion` inside the
   `$derived.by` gates so they recompute. Document the alternative for Svelte hosts:
   back `getContext()` with `$state` — with `contextVersion` in place both compose.
2. **Per-viewer edit bus (F15).** Add to `ViewerState`:

   ```ts
   annotationEditBus = {
     requestEdit: (annotationId: string) => void;   // OSDViewer → plugin (callback set by controller)
     activeEditAnnotationId: string | null;          // plugin → OSDViewer ($state)
   };
   ```

   - `OSDViewer.requestAnnotationEdit` calls `viewerState.annotationEditBus.requestEdit`
     instead of dispatching on `window`.
   - The manager sets `activeEditAnnotationId` via a callback the controller wires to
     the bus (manager must not import viewer state directly — keep it injected, mirroring
     the existing `onSelectionChange` pattern).
   - `OSDViewer` reads `activeEditAnnotationId` reactively — delete its
     `window.addEventListener(ACTIVE_EDIT_ID_EVENT, ...)` block entirely.
   - **Deprecation shim:** keep dispatching both window CustomEvents for one release
     (marked deprecated in CHANGELOG) in case external code listens; do not keep the
     listeners.
3. Confirm the `requestAnnotationEdit` gating (`editorPanel.isVisible()`) still works
   through the bus, and that the panel-open lookup by id
   (`'annotation-editor:panel'`) survives any flyout-target rename from slice-14 (guard
   both ids if needed).

## Tests

- Two `ViewerState` instances with two managers: `requestEdit` on bus A selects in A
  only; `activeEditAnnotationId` set in A does not hide overlays driven by B's state
  (unit-level: assert bus isolation).
- `contextVersion` bump re-evaluates `canCreate` (extension whose `canCreate` reads a
  mutable variable: flip it, invalidate, assert the gate flipped).
- Shim: window events still dispatched (spy) while bus is the functional path.

## Acceptance

- `pnpm exec vitest run` green across plugin + viewer suites; `pnpm check` clean.
- Manual: demo page with two `<TriiiceratopsViewer>` instances, both with the plugin —
  click-to-edit affects only the clicked viewer.

## Completion notes

_(fill in when done)_
