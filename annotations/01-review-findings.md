# Annotation Editor Plugin — Review Findings

Reviewed 2026-07-03 against `src/lib/plugins/annotation-editor/` plus the supporting
display pipeline (`AnnotationOverlay.svelte`, `OSDViewer.svelte`, `annotationAdapter.ts`,
`canvasImageSpace.ts`, `manifestsState`) and the Annotorious v3 dist actually installed
(`@annotorious/openseadragon@^3.7.19`).

Severity legend: **Critical** = corrupts persisted data or silently drops user data.
**High** = feature broken or leaks. **Medium** = soundness/maintenance/UX.

---

## A. Critical — data corruption / data loss

### F1. Annotations created after canvas navigation persist the wrong `target.source`
`AnnotationManager.initAnnotorious()` creates the W3C format adapter once, capturing the
canvas id at init time:

- `AnnotationManager.svelte.ts:130` — `const sourceId = canvasId ?? 'unknown';`
- `AnnotationManager.svelte.ts:137` — `adapter: this.W3CImageFormat(sourceId)`

Annotorious's W3C serializer stamps that captured id into **every** annotation it emits
(verified in the installed dist: `target: {...a, source: t, ...}` where `t` is the value
passed to `W3CImageFormat`). `handleCanvasChange()` updates `currentCanvasId` but never
recreates or reconfigures the annotator, and `ensureTargetSource()`
(`AnnotationManager.svelte.ts:746`) only fills in a *missing* source — the stale one wins.

**Failure:** open a manifest, navigate to canvas 2, draw a rectangle. The adapter is
called with the correct `canvasId` argument (so it lands under the right storage key),
but the annotation JSON itself targets canvas 1. Any adapter that trusts the annotation
body (i.e., every real annotation server) stores a corrupt target; IIIF export is wrong.

### F2. `extension.prepareDraft` / `prepareAnnotation` enrichment is never persisted on create
`setupEvents()` (`AnnotationManager.svelte.ts:532-537`):

```ts
this.annotorious.on('createAnnotation', async (annotation) => {
    const prepared = this.prepareAnnotation(annotation);  // runs prepareDraft
    this.onAnnotationCreated?.(prepared);                  // UI only
    await this.saveAnnotation(annotation);                 // saves the RAW annotation
    ...
});
```

The prepared draft (the documented mechanism for hosts to attach bodies/metadata) is
only shown in the panel. `adapter.create()` receives the raw Annotorious annotation. If
the user deselects without pressing Save, the enrichment is silently lost. This defeats
the exact extension pattern `docs/plugins.md` recommends.

### F3. Saving bodies persists twice (and can race into duplicate creates)
`updateAnnotationBodies()` (`AnnotationManager.svelte.ts:883-908`) calls
`saveAnnotation(updated)` directly **and then** `annotorious.updateAnnotation(updated)`,
which fires the `updateAnnotation` event, whose handler (`:539-542`) calls
`saveAnnotation` again. Every body save hits the adapter twice; combined with F4 the two
in-flight `load()` calls can both conclude "does not exist" and `create()` twice.

### F4. Create-vs-update decided by re-loading the whole canvas from the adapter on every save
`saveAnnotation()` (`AnnotationManager.svelte.ts:718-737`) does
`const existing = await this.adapter.load(...)` then `existing.some(...)` for each save.
For a remote adapter that is a full network round-trip per save, per keystroke-save, and
it is racy (concurrent saves each observe stale state). The manager already maintains
`persistedAnnotations` — it should be the source of truth. Note also the cache is
mutated (`persistedAnnotations.set`, `:716`) *before* the adapter succeeds, with no
rollback on failure (see F20).

### F5. No way for an adapter to return the server-assigned annotation ID
`AnnotationStorageAdapter.create()` returns `Promise<void>` (`types.ts:44-48`). W3C
Annotation Protocol servers (and virtually all real annotation servers) mint the
annotation IRI on POST. The plugin permanently keeps its local id
(`point-<uuid>` / Annotorious UUID), so subsequent `update`/`delete` calls reference an
id the server never issued. Adapters currently must maintain their own id-mapping table —
significant adapter complexity that belongs in the plugin.

### F6. Undo/redo is desynchronized from persistence
`undo()/redo()` (`AnnotationManager.svelte.ts:954-962`) drive Annotorious's in-memory
store only. Saves have already happened (`createAnnotation`/`updateAnnotation` handlers),
so undoing a creation leaves the annotation in storage — it visually disappears and then
resurrects on reload. Since Annotorious only ever holds the one actively-edited
annotation (the manager calls `clearAnnotations()` on deselect), the undo stack is
near-meaningless as exposed.

### F7. The `__fullBodyLoaded` hydration flag does not survive the Annotorious round-trip
`hydrateAnnotation()` (`AnnotationManager.svelte.ts:821-828`) reads
`selected.__fullBodyLoaded` from `annotorious.getAnnotations()`. But annotations passed
through `setAnnotations()` are parsed into Annotorious's internal shape and re-serialized
on read; the serializer builds a fresh object from known fields only (verified in dist),
so the marker property is dropped. Consequence: `selected.__fullBodyLoaded !== false` is
always true and lazy hydration never triggers for annotations being edited — the panel
edits (and then **saves**) the skeleton body over the full one. For adapters using
`hydrate` this is body-data loss.

---

## B. High — broken features and leaks

### F8. `defaultTool`/active tool ignore the `tools` config
`AnnotationManager` ctor (`:69`) and the controller (`AnnotationEditorController.svelte:25-27`)
default to `'rectangle'` even when `config.tools = ['point']`. The UI shows only the
point button, but the *active* tool is rectangle and Annotorious native drawing is
enabled for it — clicking the canvas starts a rectangle. The user's point-only project
configuration is broken out of the box.

### F9. Dead `formatter` option — point annotations never get their circular styling in the editor
`initAnnotorious()` passes `formatter: ...` (`AnnotationManager.svelte.ts:147-152`).
`formatter` is an Annotorious **v2** API; it does not exist in v3 (confirmed: no
occurrence in the installed dist outside an unrelated `qs` bundle). The
`point-annotation` class is never applied, so the CSS at `:488-494`
(`.a9s-annotation.point-annotation rect { rx: 999px }`) never matches. Point annotations
render as tiny squares while editing. (The `.point-selected` container class *does* work
because the manager toggles it manually on selection.)

### F10. Custom adapters don't display anything: display-state injection lives inside `LocalStorageAdapter`
`LocalStorageAdapter.load()` side-effects `manifestsState.setUserAnnotations(...)`
(`LocalStorageAdapter.ts:93-101`). That injection is what makes annotations render in
the read-only overlay — and it is an **adapter** responsibility today, not a plugin one.
An adapter written per the docs example (`docs/plugins.md`, "Custom Storage Adapters")
persists fine but renders nothing, with no error. This is the single largest violation of
"the adapter should not need to be significant": every adapter author must discover and
import `manifestsState` from the main package and replicate the injection + the
`__fullBodyLoaded` bookkeeping.

### F11. `adapter.destroy()` is never called
The contract defines `destroy?()` and `LocalStorageAdapter` implements it (clearing its
injected canvases), but nothing invokes it — not `AnnotationManager.destroy()`, not the
controller, not the plugin system. Injected user annotations leak in `manifestsState`
after plugin teardown.

### F12. OSD viewer handlers are never removed
`init()` attaches `open` (`:89`) and `canvas-click` (`:100`) handlers on the host app's
viewer and `destroy()` (`:964-968`) does not remove them. Destroying/recreating the
plugin (or opening/closing a viewer that outlives it) accumulates handlers and keeps the
manager reachable (memory leak; the stale `canvas-click` handler still calls
`preventDefaultAction` while `isDrawingEnabled` was left true).

### F13. Cancelling the delete-confirmation dialog cancels the whole editing session
`handleCancelDelete()` (`AnnotationEditorController.svelte:178-182`) calls
`manager.cancelSelection()`. Pressing "Cancel" on the modal deselects the annotation and
closes the body editor — the user loses their place (and any unsaved body edits).

### F14. Canvas-change load race
`loadAnnotations()` (`:678-703`) has no sequencing/abort. Navigate quickly between
canvases with a slow adapter and a late response from canvas A repopulates
`persistedAnnotations` while canvas B is current.

### F15. Cross-component wiring uses global `window` events
`triiiceratops:annotation-editor:request-edit` and `...:active-edit-id` are dispatched
and consumed on `window` (`AnnotationEditorController.svelte:16`,
`AnnotationManager.svelte.ts:31`, `OSDViewer.svelte:27-29`). Two viewer instances on one
page cross-talk: clicking an annotation in viewer A opens it for editing in viewer B's
editor, and A's "active edit id" hides overlays in B.

### F16. `canCreate` / `getCreateDisabledReason` are not reactive to host context
The controller wraps them in `$derived.by` (`AnnotationEditorController.svelte:45-60`),
but the only reactive dependencies are Svelte state (`isEditing`, `selectedAnnotation`,
viewer ids). `extension.getContext()` reads external host state (the docs example reads
`window.appSelection`); when that changes, the gate is not re-evaluated. There is no
invalidation hook.

### F17. Point creation is imprecise and zoom-dependent
`handlePointClick()` (`AnnotationManager.svelte.ts:187-252`) creates a 2-*screen*-pixel
fragment rectangle: the stored geometry (before the save-time PointSelector conversion)
depends on the zoom level at click time, `Math.round` on `x`/`y` (`:226-227`) plus the
center-back-out arithmetic in `getPointCoordinates()` shifts the point by up to ±0.5+
canvas px, and the whole flow (click → synthesize rect → save → derive center) exists
only because the point is not modeled as a point. The user requirement is explicit: the
point tool must create a IIIF `PointSelector` directly, not a small selection.

### F18. Manually-created point annotations carry no attribution or motivation
`handlePointClick` builds the annotation by hand (`:229-243`): no `creator` (the
`anno.setUser()` stamping only applies to Annotorious-drawn shapes), no `created`
timestamp, no `motivation`, empty `body: []`. Drawn shapes get `creator`/`created` from
Annotorious, so persisted data is inconsistent across tools. The plugin should stamp
`creator`/`created`/`modified`/`motivation` uniformly so adapters don't have to.

### F19. IIFE/web-component build omits the point tool
`iife-entry.ts:20` — `tools: ['rectangle', 'polygon']`, inconsistent with the ESM default
(`index.ts:57`) and the docs, which advertise all three tools.

---

## C. Medium — soundness, API hygiene, maintenance

### F20. Optimistic cache writes with swallowed errors and no user feedback
All adapter failures end at `console.error` (`saveAnnotation :738`, `loadAnnotations
:697`, `deleteAnnotation :875`). `persistedAnnotations` is updated before the adapter is
awaited and never rolled back. A user annotating against a flaky server sees green-path
UI while writes fail. There is no `onError` hook or status surface.

### F21. `any`-heavy public types
The extension hooks, callbacks, and `selectedAnnotation` are all `any`
(`types.ts:7,21-31,61-63`). `W3CAnnotation.target` (`adapters/types.ts:9-19`) cannot
represent target arrays, `SvgSelector` values, or typed bodies. Adapter authors get no
compiler help — the opposite of the "minimal adapter" goal.

### F22. Project-specific field baked into the shared type
`W3CAnnotation.apatopwa` (`adapters/types.ts:27-31`) is a leftover host-app field. It
should not ship in the library's public contract (the custom-body-editor work in the plan
replaces the need for it with generic body/extension typing).

### F23. Vendored, minified copy of Annotorious CSS
`injectStyles()` embeds the entire Annotorious stylesheet as a string
(`AnnotationManager.svelte.ts:444-445`) *and* the panel imports the real CSS file
(`AnnotationEditorPanel.svelte:19`). The vendored copy (with hashed svelte class names
like `svelte-g4ws1v`) will silently break on any `@annotorious/*` upgrade. Import the
package CSS with `?inline` and inject that single source of truth (same pattern as the
shadow-DOM CSS handling used by the element build).

### F24. Hardcoded English string bypasses i18n
"Loading the full annotation text..." (`AnnotationEditorPanel.svelte:289-291`) is not a
paraglide message; every other string in the panel is.

### F25. `setTimeout`-based sequencing
`init` waits 250 ms after `open` (`:90-93`), point creation waits 50 ms before select
(`:249-251`), `selectAnnotationById` selects on a 0 ms timer (`:941-943`). These are
timing guesses; slow devices/big canvases can miss them (symptom: point created but not
selected; annotator initialized before layout settles). Should be event/promise driven.

### F26. `'unknown'` can be persisted as a target source
`sourceId = canvasId ?? 'unknown'` (`:130`) plus the same fallback in
`toPointSelectorTarget`/`toAnnotoriousTarget` (`:346-349,:373-376`) means a viewer opened
before a canvas resolves can write annotations targeting the literal string `unknown`.
Creation should be blocked until a canvas id exists.

### F27. Annotorious `deleteAnnotation` event is not handled
The only delete path that reaches the adapter is the panel's trash button. Any deletion
originating inside Annotorious (API consumers, future keyboard support) would desync
storage. Cheap to wire defensively.

### F28. Test coverage is minimal
`AnnotationManager.test.ts` covers only point serialization math (4 tests). No coverage
for: the save flow (create-vs-update, single-call guarantees), canvas-change/`source`
correctness (F1), prepared-draft persistence (F2), hydration, tool config, adapter error
paths, id reconciliation, or the panel. Most bugs above would have been caught by a
mocked-adapter integration test.

### F29. Body editor is hard-coded; no custom widget support (user feature request)
`AnnotationEditorPanel.svelte:211-318` hard-codes the body model: a list of
`{purpose, value}` rows with a fixed `W3C_PURPOSES` select and three input variants.
Projects with complex/structured annotation bodies (the user's stated need) cannot
replace this UI or round-trip non-`TextualBody` bodies through it (`handleSaveBodies`
filters out anything without a truthy `value` string, `:99-103` — a structured body with
no `value` field is silently deleted on save).

### F30. Config surface gaps
No way to: set default `motivation`; style points (`POINT_MARKER_SIZE` is a constant in
`OSDViewer.svelte:50`; `POINT_SELECTOR_RENDER_SIZE` in the manager); restrict/extend the
purposes list; hide the mode toggle or undo/redo; render as a flyout (the plugin system
already supports `target: 'flyout'`, `types/plugin.ts:15`); start in create mode. These
are all needed for per-project configuration (user feature request).

---

## What already works (worth preserving)

- **Read-only display of `PointSelector` annotations** is already implemented end-to-end:
  `annotationAdapter.ts` parses `PointSelector` → `POINT` geometry, and
  `OSDViewer.svelte` renders zoom-independent 10 px markers. The gap is authoring/editing,
  not display.
- The canvas-space ↔ image-space transform layer (`canvasImageSpace.ts`) is solid and
  well-tested, and persisting in **canvas coordinates** is the right IIIF-correct choice.
- The extension-hook concept (`getContext`/`canCreate`/`prepareDraft`/`beforeSave`/
  `onSelectionChange`) is the right shape; the bugs are in how the manager honors it.
- The separation "Annotorious holds only the annotation being edited; persisted
  annotations render via the lightweight overlay" is a good architecture for large
  annotation sets — keep it.
