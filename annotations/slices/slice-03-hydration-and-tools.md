# Slice 03 — Internal hydration state + tool config that works

- **Phase:** 1 (Correctness & lifecycle)
- **Status:** not started
- **Depends on:** slice-02
- **Findings:** F7, F8, F19
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §1.4, §1.5

## Goal

Lazy body hydration must actually work (the `__fullBodyLoaded` marker is dropped by
Annotorious's parse/serialize round-trip today, so skeleton bodies can be saved over
full ones), and `config.tools` must actually constrain the active tool
(`{tools: ['point']}` currently leaves the rectangle tool live).

## Files

- `src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts`
- `src/lib/plugins/annotation-editor/AnnotationEditorController.svelte`
- `src/lib/plugins/annotation-editor/iife-entry.ts`
- `src/lib/plugins/annotation-editor/AnnotationManager.test.ts`

## Implementation

1. **Hydration state map (F7).** Add `private hydrationState = new Map<string,
   'skeleton' | 'full'>`. Populate it when caching `load()` results (an annotation with
   `__fullBodyLoaded === false` → `'skeleton'`, else `'full'`), then strip
   `__fullBodyLoaded`/`__bodyPreview` from anything handed to Annotorious or the panel.
   `hydrateAnnotation` and `resolvePersistedAnnotation` consult the map instead of the
   property; successful hydration sets `'full'`. Clear the map on canvas change/destroy.
   The adapter contract is unchanged: adapters may still mark skeletons with
   `__fullBodyLoaded: false` on `load()` results — it is read once by the plugin.
2. **Tool resolution (F8).** Add a single `resolveTools(config)` helper (export it for
   the controller): `tools = config.tools?.length ? config.tools : ['rectangle',
   'polygon', 'point']`; `defaultTool = config.defaultTool && tools.includes(...)
   ? config.defaultTool : tools[0]`. Use it in the manager ctor and expose
   `manager.resolvedDefaultTool`; the controller initializes `activeTool` from it
   instead of hard-coding `'rectangle'`. When the active tool is not in `tools`, never
   enable Annotorious native drawing.
3. **IIFE parity (F19).** `iife-entry.ts`: `tools: ['rectangle', 'polygon', 'point']`.

## Tests

- Hydrate-capable mock adapter returning a skeleton (`__fullBodyLoaded: false`, stub
  body): select → `hydrate` called; panel/`onSelectionChange` receives the full body;
  saving after hydration persists the full body (regression for the F7 data-loss path).
- Skeleton selected, `hydrate` never resolves → save is blocked (existing
  `isHydratingSelection` behavior) — assert no adapter `update` with the stub body.
- `{tools: ['point']}` → `resolvedDefaultTool === 'point'`, Annotorious
  `setDrawingEnabled(false)`, and (component test or controller-level assertion) only
  one tool button rendered.
- `{tools: ['polygon'], defaultTool: 'rectangle'}` → resolved default is `'polygon'`.

## Acceptance

- `pnpm exec vitest run src/lib/plugins/annotation-editor` green; `pnpm check` clean.
- Manual: configure the demo with `tools: ['point']` — clicking the canvas in create
  mode must not start a rectangle.

## Completion notes

_(fill in when done)_
