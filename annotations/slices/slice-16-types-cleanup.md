# Slice 16 — Public types cleanup

- **Phase:** 4 (Configuration & body editor)
- **Status:** not started
- **Depends on:** slice-07, slice-13 (config surface final before typing it)
- **Findings:** F21
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §4.5

## Goal

Adapter and extension authors get real compiler help: no `any` on the public surface,
and `W3CAnnotation` can represent what actually flows through the plugin.

## Files

- `src/lib/plugins/annotation-editor/types.ts`
- `src/lib/plugins/annotation-editor/adapters/types.ts`
- `src/lib/plugins/annotation-editor/index.ts` (exports)
- internal call sites that were leaning on `any`

## Implementation

1. **Generics:** `AnnotationEditorConfig<TBody = W3CAnnotationBody, THostContext =
   unknown>`; extension hooks (`prepareDraft`, `beforeSave`, `onSelectionChange`) and
   `AnnotationEditorRuntimeContext.selectedAnnotation` typed as
   `W3CAnnotation<TBody>` instead of `any`.
2. **Widen `W3CAnnotation`:**
   - `target: W3CTarget | W3CTarget[]` with a selector union:
     `FragmentSelector | PointSelector | SvgSelector | { type: string; … }` (open union
     — never narrow away unknown selector types);
   - `body?: TBody | TBody[]`; add `type?: string` to `W3CAnnotationBody` (e.g.
     `'TextualBody'`);
   - keep index-signature escape hatches (`[key: string]: unknown`) so round-tripping
     never drops host fields.
3. **Internal markers out of the public type:** remove `__fullBodyLoaded` /
   `__bodyPreview` from the exported `W3CAnnotation` (internal since slice-03). Keep
   *accepting* them on `load()` results — type the adapter return as
   `W3CAnnotation & { __fullBodyLoaded?: boolean }` via a small `AdapterLoadResult`
   alias so the contract stays explicit and documented.
4. Sweep the plugin for `any` on exported/public signatures (`manager.osdViewer` etc.
   may stay `any` internally — OSD has no bundled types here; do not chase internal
   `any`s beyond the public surface).
5. No runtime changes. If typing reveals a real bug, fix it in a separate commit within
   the slice and note it below.

## Tests

- No new runtime tests required; the gate is `pnpm check` (svelte-check + tsc) with
  zero new suppressions.
- Add a type-level smoke file (expect-error style or just a compiled example) showing:
  a typed custom adapter compiles; passing a wrong-shaped annotation to
  `adapter.create` fails to compile.

## Acceptance

- `pnpm check` and `pnpm lint` clean; `pnpm exec vitest run` green;
  `pnpm build:lib` emits `.d.ts` without errors.
- `docs/plugins.md` code samples still typecheck against the new types (spot-check the
  adapter example).

## Completion notes

_(fill in when done)_
