# Slice 14 — UI configuration knobs + flyout target

- **Phase:** 4 (Configuration & body editor)
- **Status:** not started
- **Depends on:** slice-03 (tool resolution), slice-13 (panel structure settled)
- **Findings:** F30
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §4.2

## Goal

Per-project configuration without forking: hide chrome you don't need, start in create
mode, restrict purposes, and render the whole plugin as a toolbar flyout (the plugin
system already supports `target: 'flyout'` — see `src/lib/types/plugin.ts:15` and the
image-manipulation plugin for the pattern).

## Files

- `src/lib/plugins/annotation-editor/types.ts`
- `src/lib/plugins/annotation-editor/AnnotationEditorPanel.svelte` /
  `AnnotationEditorController.svelte`
- `src/lib/plugins/annotation-editor/index.ts` (target/position pass-through)
- `src/demo-consumer/` or `src/demo/` (the Phase-4 acceptance example)
- tests

## Implementation

1. **Config:**

   ```ts
   ui?: {
     showModeToggle?: boolean;      // default true; false + startInCreateMode → always-create
     startInCreateMode?: boolean;   // default false
     showUndoRedo?: boolean;        // default true (buttons exist again after slice-09)
     purposes?: string[];           // built-in editor purpose list, default W3C_PURPOSES
     allowMultipleBodies?: boolean; // default true — hides "Add content" when false
   }
   ```

   Wire each through the panel/DefaultBodyEditor. `startInCreateMode` must respect the
   `canCreateAnnotation` gate (fall back to edit mode when creation is disabled).
2. **Plugin placement:** extend `createAnnotationEditorPlugin` config with
   `target?: 'panel' | 'flyout'` and `position?: 'left' | 'right' | 'bottom' |
   'overlay'`, mapping to `createPanelPlugin`/`createFlyoutPlugin`. Verify the
   controller renders acceptably in the flyout's compact popover (the `embedded` prop
   path already exists; reuse it for flyout sizing).
3. Top-level config recap check — by the end of this slice the config surface should
   include (added in earlier slices): `defaultMotivation` (slice-07),
   `onPersistenceError` (slice-08), `pointStyle` (slice-12), `bodyEditor` (slice-13).
   Ensure all are exported from `index.ts` types and documented inline with JSDoc.

## Tests

- `ui.purposes: ['tagging']` → DefaultBodyEditor select shows only `tagging`.
- `ui.showModeToggle: false, startInCreateMode: true` → panel opens in create mode with
  no toggle; with `canCreate` returning false it opens in edit mode.
- `allowMultipleBodies: false` → no Add-content button; existing multi-body annotations
  still render all bodies.
- `target: 'flyout'` → `createAnnotationEditorPlugin` returns a def with
  `target: 'flyout'` and a `flyout` component set.

## Acceptance

- `pnpm exec vitest run src/lib/plugins/annotation-editor` green; `pnpm check` clean.
- Manual: demo-consumer example reproducing the target project: **point tool only,
  flyout target, custom body editor** writing a structured body — this is the
  user-scenario acceptance for the whole of Phases 3–4.

## Completion notes

_(fill in when done)_
