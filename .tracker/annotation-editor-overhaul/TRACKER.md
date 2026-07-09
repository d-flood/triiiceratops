# Tracker for annotation-editor-overhaul

## Purpose

This document tracks the status of all tickets in the epic. The epic overhauls
`src/lib/plugins/annotation-editor/` (reviewed 2026-07-03, findings `F1`–`F30` in
[review-findings.md](./review-findings.md)) so that:

1. Consumers can bring their own annotation-server adapter without the adapter being
   significant — the plugin handles display sync, ids, stamping, caching, and errors.
2. The point tool creates (and the viewer renders) true IIIF `PointSelector` points.
3. The plugin is configurable per project — e.g. point-tool-only with a custom widget
   for complex annotation bodies.

The narrative plan (background and rationale; tickets reference its sections) is in
[SPEC.md](./SPEC.md). Implementation tickets are in [tickets/](./tickets/).

## Current Status

Overall status: `Completed`

Current ticket: 18-tests-docs-migration (Completed) — epic complete

Last updated: 2026-07-08

## Ledger

| Number | Filename | Status | Depends On |
| --- | --- | --- | --- |
| 01 | `01-target-source.md` | Completed | None |
| 02 | `02-persistence-flow.md` | Completed | 01 |
| 03 | `03-hydration-and-tools.md` | Completed | 02 |
| 04 | `04-lifecycle-ux-cleanup.md` | Completed | 02 |
| 05 | `05-annotation-store.md` | Completed | 01, 02, 03, 04 |
| 06 | `06-display-sync.md` | Completed | 05 |
| 07 | `07-server-ids-stamping.md` | Completed | 05, 06 |
| 08 | `08-error-surface.md` | Completed | 05, 06, 07 |
| 09 | `09-undo-redo.md` | Completed | 08 |
| 10 | `10-adapter-kit.md` | Completed | 06, 07 |
| 11 | `11-pointselector-authoring.md` | Completed | 07 |
| 12 | `12-point-editing-rendering.md` | Completed | 11 |
| 13 | `13-custom-body-editor.md` | Completed | 05, 08 |
| 14 | `14-ui-knobs-flyout.md` | Completed | 03, 13 |
| 15 | `15-reactivity-scoped-events.md` | Completed | 04 |
| 16 | `16-types-cleanup.md` | Completed | 07, 13 |
| 17 | `17-css-single-source.md` | Completed | 12 |
| 18 | `18-tests-docs-migration.md` | Completed | 01–17 (all) |

**Milestones:** tickets 01–04 make current behavior correct (shippable alone); 01–10
deliver the minimal-adapter goal; 11–12 deliver IIIF points; 13–16 deliver the
point-only + custom-body project configuration; 17–18 harden and document.

## Decisions (already made — don't re-litigate, but flag if an ticket proves one wrong)

| # | Decision | ADR |
|---|---|---|
| D1 | Undo/redo: remove the Annotorious-backed UI in ticket 04; rebuild persistence-aware in ticket 09. | [0003](../../docs/adr/0003-persistence-aware-undo-redo.md) |
| D2 | Point coordinates round to **integer canvas pixels** (matches IIIF cookbook usage). | [0004](../../docs/adr/0004-iiif-point-persistence-format.md) |
| D3 | Keep a read-compat path for legacy fragment-rect "points" for one release; new writes are always `PointSelector`. | [0004](../../docs/adr/0004-iiif-point-persistence-format.md) |
| D4 | The built-in body editor renders unknown/structured body shapes read-only and never drops them on save. | [0005](../../docs/adr/0005-unknown-annotation-bodies-are-never-dropped.md) |

Related architecture ADRs:
[0001 — plugin-owned display sync](../../docs/adr/0001-plugin-owned-display-sync.md),
[0002 — Annotorious holds only the edited annotation](../../docs/adr/0002-annotorious-holds-only-the-edited-annotation.md).

## Notes for implementers

Read the ticket file end-to-end, the findings it references, and the spec section it
cites before editing. Read the actual source files first — line numbers in the findings
drift as tickets land. If reality contradicts the ticket (code moved, an approach doesn't
work), prefer reality, do the minimal sensible adaptation, and record the deviation in
the ticket's Completion notes. If the deviation invalidates a *later* ticket's
assumptions, add a note to that ticket's file too.

Verification bar for every ticket (tickets may add more):

- `pnpm exec vitest run src/lib/plugins/annotation-editor` (note: bare `pnpm test`
  starts vitest in watch mode — don't use it)
- `pnpm exec vitest run` (full suite) before marking Completed
- `pnpm check` (svelte-check + tsc) and `pnpm lint`

On completion: fill in the ticket's Completion notes (what changed, deviations,
follow-ups), update the ledger row and Current Status above, and append a row to the
work log below. One commit per completed ticket containing only the files the ticket
touched plus this directory's tracker updates, message:
`annotation-editor: ticket NN — <title>`. Do not commit unrelated dirty files.

Mark an ticket `Needs Human Validation or Intervention` (and stop and report) when it is
blocked on a decision not covered by the Decisions table, or verification fails in a
way the ticket doesn't anticipate.

Useful context:

- Repo uses **pnpm**. Dev demo: `pnpm dev`. E2E: `pnpm test:e2e` (only where an ticket
  asks). Library build: `pnpm build:lib`; element build: `pnpm build:element`;
  IIFE plugins: `pnpm build:plugins-iife`.
- i18n is paraglide: message keys live in `messages/en.json` and `messages/de.json`;
  UI strings go through `m.*` — never hardcode.
- The element (web component) build renders in shadow DOM — CSS must be injected into
  the root node, not assumed to come from document `<head>`.
- Annotorious v3 (`@annotorious/openseadragon@^3.7`) — v2 APIs (`formatter`,
  `readOnly` flags, etc.) do not exist; verify against `node_modules` when unsure.
- Shared vocabulary for this epic (adapter, display sync, hydration, echo, stamping,
  reconciliation, …) is defined in the repo [CONTEXT.md](../../CONTEXT.md).

## Work log

_Append one row per completed (or halted) ticket — newest last._

| Date | Ticket | Agent notes |
|---|---|---|
| 2026-07-03 | 01 | `forceTargetSource` always overwrites `target.source` with the current canvas id; dropped all `'unknown'` fallbacks; null-canvas guards in `handlePointClick`/`updateDrawingMode`. +3 regression tests. Full suite 320 pass, `check` clean. Pre-existing lint error in `ui/Select.svelte` left untouched. Manual localStorage inspection not done in headless run. |
| 2026-07-03 | 02 | Persist prepared draft via `persistCreate` (F2); single `persist()` chokepoint = cache-based create/update + per-id `saveQueue`, no `adapter.load` per save, cache set after success (F4); `updateAnnotationBodies` saves once + suppresses the echo (F3); `loadSequence` race token in load+hydrate (F14). **Deviation:** Annotorious v3 fires lifecycle events async (`setTimeout(…,1)`), so the planned boolean `suppressPersistence` was replaced with an id-scoped `withSuppressedEcho`/`consumeSuppressedEcho`; corrected & flagged into ticket 04. +4 tests (11 plugin / 324 total pass), `check` + plugin lint clean. |
| 2026-07-07 | 04 | F12: `init()` retains open/canvas-click handler refs, `destroy()` removes them + nulls `osdViewer`. F11: `destroy()` calls `adapter.destroy?.()` + clears cache/hydration maps. F27: added `handleDeleteAnnotation` + `clearAnnotationsSuppressed()` (marks each present id so our own clear echoes are consumed, not persisted); genuine Annotorious deletes of a **cached** annotation sync the adapter. **Design choice:** trash-button path relies on a cache-membership guard (cache entry removed before `removeAnnotation`) instead of marking the removeAnnotation echo — avoids stale marks. F13: dropped `cancelSelection()` from `handleCancelDelete`. F6/D1: removed undo/redo buttons + all `canUndo/canRedo/onUndo/onRedo`/`onUndoRedoChange`/`undo`/`redo`/`updateUndoRedoState` plumbing (kept `_undo`/`_redo` message keys for ticket 09). F9(partial): dropped dead `formatter` config key. F22: removed `apatopwa`. F24: `annotation_editor_hydrating` message. F25: rAF init instead of 250ms, synchronous `setSelected`. +4 tests (19 plugin / 343 total pass), `check` 0 errors, touched files lint-clean. Controller cancel-delete + manual acceptance not run headless (no component-test harness). |
| 2026-07-07 | 05 | Extracted `AnnotationStore.svelte.ts` (internal, unexported): owns cache, hydrationState, saveQueue, loadSequence, raw adapter, canvas context, strip/cache helpers. Manager keeps Annotorious/OSD mechanics + transforms and reads canvas context via getters delegating to the store; `suppressedEchoIds` stays in the manager (event bookkeeping). **Deviations:** kept a single auto-deciding `persist()` chokepoint instead of split `create`/`update` (those become meaningful with ticket 07's return-canonical); `setCanvas` sets context + clears cache but does not load (display-sync-on-load is ticket 06); `hydrate(id, shouldApply?)` takes a guard so the manager keeps its "still present in Annotorious" veto. No behavior change. Tests repointed from `(manager as any).persistedAnnotations/…/currentCanvasId` to `store.*`; kept as manager-level integration tests (no deletions). 19 plugin / 343 total pass, `check` 0 errors, touched files lint-clean. Manual demo pass not run headless. |
| 2026-07-07 | 03 | F7: wired `hydrateAnnotation` + `resolvePersistedAnnotation` to consult the `hydrationState` map (the marker-based checks were dead because markers are stripped from the cache); `persist()` marks ids `'full'`, canvas-change/destroy clear the map, delete drops the id; removed the redundant `__fullBodyLoaded=true` in `prepareAnnotation`. F8: controller seeds `activeTool` + panel tool list from `resolveTools(config)`. F19: IIFE gains the `point` tool. Most scaffolding pre-existed from ticket 02; only the map-consulting logic was missing. **No deviation** (F9 out of scope). +4 tests (15 plugin / 339 total pass), `check` 0 errors, touched files lint-clean. Manual `tools:['point']` demo click not run headless (covered by unit assertions). |
| 2026-07-08 | 07 | F5: adapter `create`/`update` return types widened (`void` still valid); `AnnotationStore.onReconcileId` + `reconcileCreate()` swap cache/hydration keys old→new and re-inject `manifestsState` when the adapter returns a canonical annotation or id string; `update` adopts a server-normalized returned copy. F18: `stampForCreate` fills `@context`/`type`/`creator`/`created`/`motivation` (only when absent), `stampForUpdate` refreshes `modified`; `defaultMotivation` config added. Manager sets `onReconcileId` + `handleIdReconciled` → re-opens an open annotation under the server id via `selectAnnotationById` (re-emits active-edit-id). **Deviations:** kept single `persist()` chokepoint (per ticket 05); stamping runs *after* `beforeSave` in call order but only fills gaps, so beforeSave still wins (observable contract unchanged) — flagged. +7 store / +2 manager tests (34 plugin / 356 total pass), `check` 0 errors, plugin dir lint-clean. Manual logging-adapter demo not run headless. |
| 2026-07-08 | 08 | F20: adapter failures now surface. `AnnotationStore.persist`/`delete` return booleans and route `load`/`create`/`update`/`delete`/`hydrate` rejections through one `reportError()` → host `onPersistenceError({op,annotationId,manifestId,canvasId,cause,retry})` or, without a handler, `console.error` + reactive `_panelError` (`panelError` getter / `dismissError()`). Manager: failed create removes the optimistic Annotorious shape + clears selection; failed update re-signals `onSelectionChange` with the rolled-back cached copy (Annotorious untouched); failed delete keeps the annotation + selection. Controller closes the editor only on success + shows a dismissible i18n error line (EN+DE). **Deviation:** the store is already pessimistic-commit post-ticket-05 (cache/display advance only after the adapter resolves), so "optimistic + snapshot + restore" from the plan §2.5/bullet 2 was implemented as not-advancing-on-failure + selection re-signal — same observable contract, no phantom flash; genuine rollback only needed for the create shape Annotorious holds. Queue: `run` catches internally so a rejected save frees its slot. +7 store / +3 manager tests (51 plugin / 365 total pass), `check` 0 errors, plugin dir lint-clean, changeset added. Manual failing-adapter demo not run headless. |
| 2026-07-08 | 09 | F6/D1: store-owned undo/redo op stack (`UndoableOp` = create/update/delete) recorded in `persist`/`delete` via `recordForward` (suppressed while `replaying`). `undo()`/`redo()` replay inverses through the normal `persist`/`delete` paths (so display sync, id reconciliation, error rollback apply) + push to the opposite stack; failed replay keeps the op + fires the error surface. `reconcileCreate` returns the canonical annotation → `lastCreateCanonical` lets a re-created annotation capture its server id (undo of a reconciled create deletes the canonical id). Depth capped at 50; stacks cleared on canvas change + destroy. New `store.onReplay(id, anno\|null)` → manager `handleReplay` re-opens/clears the open Annotorious session for the affected id only. `canUndo`/`canRedo` are `$state`-backed getters read through manager into a controller `$derived`; buttons restored to the panel outside create-mode gating. **Deviation:** replayed updates still run `stampForUpdate` (refreshes `modified`), so undo is content-verbatim but not timestamp-verbatim — kept the single stamping chokepoint; flagged. +8 store / +1 manager tests (50 plugin / 374 total pass), `check` 0 errors, touched files lint-clean, changeset added. Manual reload acceptance not run headless (store tests assert the storage↔display agreement it checks). |
| 2026-07-07 | 06 | F10/F11: `AnnotationStore` now owns display sync — `syncDisplay()` pushes the cached set into `manifestsState.setUserAnnotations` after load/create/update/delete + resolve-reload, tracks injected canvases, `clearUserAnnotations` on destroy. `LocalStorageAdapter` stripped to pure storage (reference minimal adapter). `createLoader(store)` sets canvas + loads (store injects) and owns `store.destroy()` via effect cleanup. `createAnnotationEditorPlugin` builds one shared store → loader + controller/manager props; manager gained optional `store` + `ownsStore` so panel close doesn't wipe the shared overlay. **Hazard fixed:** shared canvas context could make the manager's change guard skip cleanup — added manager-owned `lastHandledCanvasKey` (flagged for ticket 07). Docs note + changeset added. +4 store tests (23 plugin / 347 total pass), `check` 0 errors, plugin dir lint-clean. Manual demo not run headless. |
| 2026-07-08 | 11 | F17/§3.1: `handlePointClick` authors a real `PointSelector` at the click point — click→viewport→image→canvas via `imagePointToCanvasPoint`, single `Math.round` to integer canvas px (D2), `temp-` id. Routes through the store create path (prepareDraft + stamping + display sync) via a new `prepareAnnotation(_, {canvasSpace:true})` flag that skips the image→canvas transform; opens for editing via `selectAnnotationById` after persist, and marks the active-edit id before persisting so id reconciliation (F5) re-opens under the server id. `isPointAnnotation` reduced to a `PointSelector` check (direct + `selector.item`), dropped the `point-` id heuristic; `toPointSelectorTarget` now no-ops direct `PointSelector` targets, keeping `getPointCoordinates`'s fragment fallback for read-compat (D3). **Deviations:** `handlePointClick` is now `async` (`void`-called from the canvas-click handler); removed the now-dead `openseadragon` dynamic import + `OSD` field (existed only for the deleted screen-pixel sizing); rewrote the one point-serialization test that relied on fragment→PointSelector conversion. +4 tests (29 manager / 70 plugin / 394 total pass), `check` 0 errors, touched files lint-clean, changeset (minor) added. Manual min/max-zoom demo not run headless (zoom-invariance + integer-coord unit assertions cover it). |
| 2026-07-08 | 12 | F9(real fix)/F30(pointStyle)/§3.2–§3.4: points render + edit consistently. `toAnnotoriousTarget` now returns fully image-space for all types (points → a fragment rect sized in **screen pixels** via `imageUnitsPerScreenPixel()`, centred exactly on the point); `selectAnnotationById` dropped its outer image transform. `editingPointOrigin` (SvelteMap, canvas-space) + `pointFromEditingRect` (reached via a new `annotationToCanvasSpace` chokepoint) make an unmoved point round-trip bit-identical (D2 integer compare) and a dragged one take the new centre. Static `style` object → v3 `style` **function** `styleForAnnotation` (verified `@annotorious/core@3.7.19`: function form supported, no per-annotation className → kept `.point-selected` container class); deleted dead `.a9s-annotation.point-annotation` CSS. New `pointStyle` config (`PointStyle` in `utils/pointMarker.ts`, re-exported from plugin types + added to `ViewerConfig`); `OSDViewer` `POINT_MARKER_SIZE=10` → `$derived pointMarkerSize = resolvePointRadius()*2` (overlay geometry + hit-test), default preserves size. **Deviations:** re-added lazy `import('openseadragon')` for `OSD.Point` (ticket 11 removed it); overlay honours `radius` (tested), colour via its `--anno-red`/`--anno-yellow` tokens while the editor honours full colour config; rewrote the 2 old point tests (canvas-fragment / double-transform) into the ticket's 3 (two-zoom sizing, unmoved round-trip, drag). +6 tests (33 manager / 74 plugin + 3 util / 398 total pass), `check` 0 errors, touched files lint-clean, changeset (minor). Manual demo not run headless. |
| 2026-07-08 | 10 | F28/§2.6: adapter authoring kit. New testing subpath `testing/index.ts` exports `runAdapterContractTests(factory, {supportsIdReconciliation?, supportsHydrate?, label?})` (imports vitest; fresh adapter + unique manifest/canvas per test; round-trip resolver routes through `hydrate` on skeleton loads). `testing/adapterContract.test.ts` runs it against `LocalStorageAdapter` (hydrate) + an in-memory server-IRI fixture (reconciliation) — 16 tests. `package.json#exports["./plugins/annotation-editor/testing"]` added (ESM-only, matching `.`); `build:lib` emits it and `import.meta.resolve` finds it; `check:runtime-deps` still green (vitest never in runtime graph). Docs rewrite: 5-fn contract, runnable fetch/W3C-Annotation-Protocol adapter, "test your adapter" section. **Deviations:** `.test.js` ships to dist = pre-existing svelte-package behavior (all colocated tests already ship), out of scope to change; no `require` resolution (package is ESM-only) — verified via ESM resolve per ticket; broken `#error-handling` anchors replaced with prose naming `onPersistenceError` (that section is ticket 18). +16 tests (66 plugin / 390 total pass), `check` 0 errors, new files lint-clean, changeset (minor) added. Manual demo-consumer resolve not run beyond node ESM resolve. |
| 2026-07-08 | 13 | F29/§4.1: added `bodyEditor` config with Svelte `component` and DOM `render(container, api)` variants; panel builds a stable-per-selection `AnnotationBodyEditorApi` (annotation/bodies/context/isHydrating/save/cancel/requestDelete), re-renders DOM editors on hydration/annotation replacement, and keeps delete/selection/persistence plugin-owned. Extracted `DefaultBodyEditor.svelte` and exported it; default filtering now lives inside it and applies only to editable textual bodies, while unknown/structured bodies render read-only with an i18n note and survive sibling edits (D4). `updateAnnotationBodies` now accepts `unknown[] \| unknown` and writes through verbatim. +1 manager test, +4 component tests (76 plugin / 403 total pass), `check` 0 errors, plugin dir lint-clean, changeset (minor) added. `pnpm lint` still fails on pre-existing `src/lib/components/ui/Select.svelte:146`; manual DOM demo round-trip not run headless. |
| 2026-07-08 | 14 | F30/§4.2: added `target`/`position` and `ui` config (`showModeToggle`, `startInCreateMode`, `showUndoRedo`, `purposes`, `allowMultipleBodies`) with exported types + JSDoc. Controller honours `startInCreateMode` only when creation is allowed and syncs initial drawing state to the manager; panel hides mode/undo chrome when configured. `DefaultBodyEditor` uses configured purpose choices and hides Add Content when multiple bodies are disabled while preserving existing multi-body annotations. `createAnnotationEditorPlugin` now returns panel or flyout defs and embeds the controller in flyouts; annotation-editor IIFE exports the factory + `LocalStorageAdapter`. Demo-consumer now shows the Phase-4 scenario: point-only flyout with a vanilla structured-body editor. +2 plugin-def tests, +5 component/controller tests (83 plugin / 410 total pass), `check` 0 errors, annotation-editor IIFE build passes, changeset (minor). `pnpm lint` still fails on pre-existing `src/lib/components/ui/Select.svelte:146`; manual demo clicking not run headless. |
| 2026-07-08 | 16 | F21: public types get compiler help. `AnnotationEditorConfig<TBody = W3CAnnotationBody, THostContext = unknown>`; extension hooks + `AnnotationEditorRuntimeContext.selectedAnnotation` typed `W3CAnnotation<TBody>` (no `any`). `W3CAnnotation<TBody>` widened: `target: W3CTarget \| W3CTarget[]`, open selector union (`FragmentSelector\|PointSelector\|SvgSelector\|UnknownSelector`), `body?: TBody\|TBody[]`, `string\|string[]` for `@context`/`motivation`, `[key: string]: unknown` escape hatches. `__fullBodyLoaded`/`__bodyPreview` removed from the exported type → new `AdapterLoadResult` alias for `load()`/`hydrate()` returns; `AnnotationStorageAdapter` fully typed. Store + LocalStorageAdapter repointed to `AdapterLoadResult`. **Deviations:** widened `target` broke 3 internal manager sites reading `.target.source/.selector` directly → cast `as W3CTarget` (single-target invariant, no runtime change); `types.ts`↔`adapters/types.ts` is now a type-only import cycle (erased; `.d.ts` emits clean). Added `types.typing.test.ts` (`@ts-expect-error` smoke: typed adapter compiles, wrong-shaped annotation fails). +1 suite (86 plugin / 437 total pass), `check` 0 errors, `build:lib` `.d.ts` clean, docs adapter example still typechecks, touched files lint-clean, changeset (minor). Pre-existing `Select.svelte:146` lint error untouched. |
| 2026-07-08 | 17 | F23/§5: Annotorious CSS single-source. Manager imports `@annotorious/openseadragon/annotorious-openseadragon.css?inline` at module scope and `injectStyles` composes it with the inline plugin-fix block; deleted the vendored minified string (hashed `svelte-*` classes). Panel's side-effect CSS import removed. No vite-config change needed — `?inline` resolves in all three targets (`build:lib` ships the `.svelte.ts` import verbatim per the `app.css?inline` precedent; `build:element`; `build:plugins-iife` inlines the string — annotation-editor IIFE grep `a9s-gl-canvas`→2, core element bundle→0 by design, as the editor ships as a separate IIFE plugin there). +3 injectStyles unit tests (one `<style>` per root, no dup, document.head path); vitest stubs `?inline` CSS to empty so they assert on the inline `point-selected` rule, real CSS covered by build greps. Updated `distributions.test.ts` guard: was "panel imports stylesheet" → now "manager imports `?inline`" + "panel no longer side-effect-imports". Full suite 441 pass, `check` 0 errors, `check:runtime-deps` pass, touched files lint-clean, changeset (patch). Manual visual demo not run headless. |
| 2026-07-08 | 15 | F16/F15: added `extension.subscribe(invalidate)` + controller `contextVersion` so creation gates re-evaluate on host invalidation; added per-viewer `ViewerState.annotationEditBus` for request-edit and active-edit-id scoping. `OSDViewer` now uses the bus for functional edit requests/overlay hiding and no longer listens to global active-id events; `AnnotationManager` reports active ids through an injected callback. Deprecated `request-edit` and `active-edit-id` window events are still dispatched for one release and noted in `CHANGELOG.md`. Gate handles panel and flyout targets. +3 tests (85 plugin / 413 total pass), `check` 0 errors. `pnpm lint` still fails on pre-existing `src/lib/components/ui/Select.svelte:146`; manual two-viewer demo not run headless. |
| 2026-07-08 | 18 | F28/§5: hardening. Added `AnnotationEditor.lifecycle.test.ts` (full init→draw→edit→canvas-change→reload→delete→destroy integration over real manager+store, asserting adapter calls + `manifestsState` at each step) and `tests/annotation-editor.spec.ts` (Playwright: point authoring + body persist across reload; delete stays gone — asserted against `localStorage`, both projects). **The e2e caught a real data-loss bug** and (per human approval) it was fixed here: `suppressedEchoIds` was a `Set`, so a body save's `updateAnnotation` echo + the teardown `clearAnnotations()` delete echo for the same id collided and the delete leaked to the adapter, deleting the just-saved annotation; changed to a per-id **count** (`SvelteMap<string,number>`) so both echoes are matched. +1 regression test (red→green). Docs: `docs/plugins.md` gained Point Annotations, Custom Body Editor (Svelte + `render`), a point-only walkthrough, a full config reference table, `extension.subscribe`, and a v1→v2 migration subsection; changeset `annotation-editor-hardening.md`. **Deviation:** ticket scoped to tests/docs/migration but the fix touches `AnnotationManager.svelte.ts` (approved). Full suite 443 pass; `pnpm test:e2e` 6 pass; `check` 0 errors; lint clean except pre-existing `Select.svelte:146`; `uvx zensical build --clean` succeeds. Epic complete. |
