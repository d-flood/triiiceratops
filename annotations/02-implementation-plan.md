# Annotation Editor Plugin — Implementation Plan

Companion to [01-review-findings.md](./01-review-findings.md) (finding IDs `F1`–`F30`
referenced throughout). Goals, in the order they drive design decisions:

1. **Bring-your-own annotation server with a trivial adapter.** The plugin owns display
   sync, id reconciliation, attribution stamping, caching, create-vs-update logic, and
   error handling. An adapter is ~5 pure storage functions.
2. **True IIIF points.** The point tool creates a `PointSelector` annotation directly,
   and points render as points everywhere (read-only overlay, editing, selection).
3. **Per-project configurability.** Tool subsets that actually work, a replaceable body
   editor for complex/structured bodies, and UI knobs — without forking the plugin.
4. Fix every correctness bug found in review.

Phases are ordered so each is independently shippable. Phase 1 is pure bug-fixing with
no API changes; Phases 2–4 each change one public surface.

---

## Phase 1 — Correctness and lifecycle fixes (no API changes)

### 1.1 Fix stale `target.source` (F1, F26)
In `AnnotationManager`:
- Stop trusting the id baked into `W3CImageFormat`. In `ensureTargetSource()`, **always
  overwrite** `target.source` with `this.currentCanvasId` (rename to
  `forceTargetSource`). Within this plugin the target is by definition the current
  canvas, so overwriting is safe and makes the serializer's captured id irrelevant.
- Refuse to enter drawing mode (and short-circuit `handlePointClick`) while
  `currentCanvasId` is null — never persist `'unknown'`. Drop the `?? 'unknown'`
  fallbacks in `toPointSelectorTarget`/`toAnnotoriousTarget`.
- Regression test: init on canvas 1, `handleCanvasChange` to canvas 2, save → assert
  `target.source === canvas2`.

### 1.2 Persist the prepared draft (F2)
In the `createAnnotation` handler, save what the host prepared:

```ts
const prepared = this.prepareAnnotation(annotation); // canvas-space, draft-enriched
this.onAnnotationCreated?.(prepared);
await this.persistCreate(prepared);                  // new: skips re-transform, uses cache
```

`prepareAnnotation` already returns the canvas-space enriched clone; add a persist path
that takes it as-is (today `saveAnnotation` re-transforms from image space, so the raw
annotation was passed — that coupling is why F2 exists). `beforeSave` still runs last.

### 1.3 Single-save body updates (F3) + cache-based create-vs-update (F4)
- `saveAnnotation` decides create vs update from `persistedAnnotations.has(id)` — no
  `adapter.load()` round-trip. (After Phase 2's id reconciliation the cache is
  authoritative.)
- `updateAnnotationBodies` updates the cache + adapter once, then updates Annotorious
  inside a `suppressPersistence` guard so the resulting `updateAnnotation` event doesn't
  re-save:

```ts
private suppressPersistence = false;
private withSuppressedPersistence(fn: () => void) { ... }
// event handlers early-return when suppressPersistence is true
```

- Serialize saves per annotation id (simple promise chain per id) so rapid save clicks
  can't interleave.

### 1.4 Make hydration state internal (F7)
Replace the `__fullBodyLoaded` magic property (which does not survive the Annotorious
round-trip) with manager-internal state: `private hydrationState = new Map<string,
'skeleton' | 'full'>` populated from the adapter's returned annotations. Adapters signal
skeletons the same way (`__fullBodyLoaded: false` on `load()` results — read once by the
plugin, then stripped before anything enters Annotorious). Fixes silent body loss when a
skeleton is edited and saved. Add a test with a `hydrate`-capable mock adapter.

### 1.5 Tool config actually constrains tools (F8, F19)
- `resolveTools(config)`: `tools = config.tools?.length ? config.tools : ALL_TOOLS`;
  `defaultTool = config.defaultTool && tools.includes(config.defaultTool)
  ? config.defaultTool : tools[0]`. Use it in the manager ctor **and** the controller
  (single source: expose from the manager).
- When the active tool is excluded by config, never enable Annotorious native drawing.
- IIFE entry gets `tools: ['rectangle', 'polygon', 'point']` to match the ESM default.
- Tests: `{tools:['point']}` → `activeTool === 'point'`, `setDrawingEnabled(false)` on
  Annotorious, only one tool button rendered.

### 1.6 Lifecycle hygiene (F11, F12, F27)
- `init()` keeps references to its `open`/`canvas-click` handlers;
  `destroy()` removes them (`viewer.removeHandler`), calls `adapter.destroy?.()`, and
  clears `hydrationState`/`persistedAnnotations`.
- Handle Annotorious `deleteAnnotation` defensively: if an annotation disappears from
  Annotorious without going through `deleteAnnotation()`, sync the adapter (guarded by
  `suppressPersistence` for our own `clearAnnotations()` calls).

### 1.7 Undo/redo made truthful (F6)
Annotorious's stack can't be made persistence-aware from outside, and the manager clears
Annotorious on every deselect anyway. Replace with a small manager-owned op stack:
- Each persisted op pushes an inverse: `create → delete`, `update → restore previous
  cached copy`, `delete → re-create`.
- `undo()/redo()` replay inverses **through the adapter** (so storage and UI agree),
  updating cache + `manifestsState` + Annotorious (if the affected annotation is open).
- Cap depth (e.g. 50); clear on canvas change.
- If this is judged too heavy for the first pass, the honest minimum is to remove the
  undo/redo buttons — shipping controls that resurrect deleted data on reload is worse
  than not having them. (Decision noted in Open Questions.)

### 1.8 Load-race token (F14)
```ts
private loadSequence = 0;
async loadAnnotations() {
  const seq = ++this.loadSequence;
  const annotations = await this.adapter.load(...);
  if (seq !== this.loadSequence) return; // stale response
  ...
}
```
Same token check in `hydrateAnnotation` (compare current canvas + selected id after
await — it already checks `stillPresent`, keep that too).

### 1.9 UX/polish bugs
- Cancel-delete keeps the editing session: drop `manager.cancelSelection()` from
  `handleCancelDelete` (F13).
- Replace the hardcoded hydrating string with a paraglide message (F24).
- Remove the dead `formatter` option (F9 — real fix in Phase 3); remove the `apatopwa`
  field from `W3CAnnotation` (F22).
- Replace `setTimeout` sequencing where possible (F25): init on the viewer's `open`
  event + `requestAnimationFrame` instead of 250 ms; select-after-add via Annotorious
  `setSelected` immediately after `addAnnotation` (verify — v3 state is synchronous; if
  a frame is genuinely needed, use `requestAnimationFrame`, not magic durations).

**Phase 1 acceptance:** all existing tests pass; new regression tests for F1, F2, F3/F4
(mock adapter records exactly one call per user action), F7, F8, F14; manual pass in the
demo app: draw/edit/delete on canvases 1→2→1, reload, storage inspected.

---

## Phase 2 — Adapter API v2: "bring your own server" with a minimal adapter

### 2.1 Move display sync out of adapters (F10, F11)
The plugin (loader + manager), not the adapter, calls
`manifestsState.setUserAnnotations(...)` after every successful `load`/`create`/
`update`/`delete`, and `clearUserAnnotations` on destroy/canvas cleanup. Concretely:
- `createLoader(adapter)` becomes `createLoader(store)` where `store` is the plugin-side
  wrapper (below) — it loads *and injects*.
- Delete the injection + `injectedCanvases` bookkeeping from `LocalStorageAdapter`; it
  shrinks to pure `localStorage` reads/writes (~60 lines) and becomes the reference
  implementation for how small an adapter should be.
- Back-compat: adapters that still inject manually just get overwritten with identical
  data — harmless. Document the change in CHANGELOG.

### 2.2 `AnnotationStore` wrapper (internal), adapter stays 5 functions
Introduce an internal `AnnotationStore` that wraps the raw adapter and centralizes
everything adapters used to be implicitly responsible for:

```
AnnotationStore (plugin-internal)
├── cache (persistedAnnotations, hydrationState)   ← moved from AnnotationManager
├── create-vs-update resolution, per-id save queue
├── id reconciliation (2.3)
├── attribution stamping (2.4)
├── manifestsState display sync (2.1)
├── error handling + rollback + onError (2.5)
└── raw adapter: load / create / update / delete / hydrate?
```

`AnnotationManager` talks only to the store. This is a refactor of existing code, not
new behavior, but it is what makes 2.3–2.5 tractable and keeps the manager focused on
Annotorious/OSD mechanics.

### 2.3 Server-assigned IDs (F5)
Widen the adapter contract (backward compatible — `void` remains valid):

```ts
create(manifestId, canvasId, annotation): Promise<W3CAnnotation | string | void>;
update(manifestId, canvasId, annotation): Promise<W3CAnnotation | void>;
```

If `create` returns an annotation (or id), the store reconciles: swap cache key, update
`manifestsState`, and — if the annotation is currently open in Annotorious — re-add it
under the new id and reselect, and re-emit the active-edit-id signal. All subsequent
`update`/`delete` calls use the canonical id. Test: mock server adapter that rewrites
`point-xxx` → `https://server/anno/42`; edit + delete after creation hit the new id.

### 2.4 The plugin produces complete, valid W3C/IIIF annotations (F18)
Before any `create`, the store stamps (without clobbering host-provided values):
- `@context: 'http://www.w3.org/ns/anno.jsonld'`, `type: 'Annotation'`
- `creator` from `config.user`, `created`/`modified` ISO timestamps
- `motivation` from new `config.defaultMotivation` (default `'commenting'`)

Point and drawn annotations become uniform. `extension.beforeSave` still runs last and
can override anything.

### 2.5 Error surface (F20)
- New config: `onPersistenceError?: (error: { op: 'load'|'create'|'update'|'delete'|'hydrate';
  annotationId?: string; canvasId: string; cause: unknown; retry: () => Promise<void> }) => void`.
- Store applies cache/display changes optimistically but **rolls back** on failure
  (restore previous cached copy / remove optimistic create) and re-signals selection so
  the panel doesn't show phantom state.
- Default behavior without the hook: `console.error` + a small dismissible error line in
  the panel (i18n'd) so failures are never invisible.

### 2.6 Adapter authoring kit
- Rewrite the docs section around the minimal contract with a complete, runnable
  fetch-based example against the W3C Annotation Protocol shape (POST container / PUT /
  DELETE, reading the `Location`/returned id).
- Export an adapter conformance test helper so adapter authors can verify their
  implementation in their own vitest suite:

```ts
import { runAdapterContractTests } from 'triiiceratops/plugins/annotation-editor/testing';
runAdapterContractTests(() => new MyAdapter(...));
```

  (Covers: load empty, create→load round-trip, update, delete, id reconciliation if
  implemented, hydrate if implemented.)

**Phase 2 acceptance:** the docs example adapter — verbatim — displays, creates, edits,
and deletes annotations in the demo app. `LocalStorageAdapter` contains zero references
to `manifestsState`. Contract tests pass against `LocalStorageAdapter` and an in-memory
mock server adapter.

---

## Phase 3 — First-class IIIF points

### 3.1 Create `PointSelector` directly (F17)
`handlePointClick` builds the real thing — no synthetic fragment rectangle at creation:

```ts
const annotation = {
  '@context': 'http://www.w3.org/ns/anno.jsonld',
  id: `temp-${crypto.randomUUID()}`,       // replaced by adapter id via 2.3
  type: 'Annotation',
  body: [],
  target: {
    type: 'SpecificResource',
    source: this.currentCanvasId,
    selector: { type: 'PointSelector', x, y },   // canvas-space, exact click point
  },
};
```

- `x`/`y`: convert click → image coords → canvas coords via the existing transform
  utilities, rounding only at the end (IIIF examples use integer canvas px; keep a
  single `Math.round` on the final canvas-space values — no center-derivation drift).
- The annotation goes to the store (create path, stamped per 2.4, prepared via
  `prepareDraft`) and is selected for body editing. The zoom-dependent 2-screen-pixel
  sizing, the `point-` id prefix, and `getPointCoordinates`'s center math all go away.
- `isPointAnnotation` reduces to `selector?.type === 'PointSelector'` (plus recursing
  into `selector.item` for wrapped selectors, matching `annotationAdapter.ts`).

### 3.2 Editing representation
Annotorious v3 has no point tool, so editing keeps a translation layer — but make it
presentational and lossless:
- `toAnnotoriousTarget` converts `PointSelector` → a small fragment rect **sized in
  screen pixels at selection time** (compute image-units-per-screen-pixel the way
  `handlePointClick` does today) so the marker is a consistent visual size regardless of
  image resolution. Store the exact point on the manager
  (`editingPointOrigin: Map<id, {x,y}>`) so converting back never re-derives from the
  rect center: if the user didn't drag it, the saved point is bit-identical to the
  loaded one; if they did drag it, take the rect center as the new point.
- Keep hiding resize handles via `.point-selected`; allow drag-to-move.

### 3.3 Point rendering while editing (F9)
Replace the dead `formatter` with Annotorious v3's supported styling: the `style`
function form `(annotation, state) => DrawingStyle` for fill/stroke, and keep the
`.point-selected` container class (manager-toggled, already working) for the
handle-hiding and `rx` rounding CSS. Verify against v3.7 docs that per-annotation class
names aren't supported; if they are (e.g. via recent `className` support), prefer that
over container-class CSS.

### 3.4 Point display consistency + styling config (F30 partial)
- New config `pointStyle?: { radius?: number; fill?: string; stroke?: string;
  strokeWidth?: number }` consumed by **both** the read-only overlay
  (`OSDViewer.svelte`'s `POINT_MARKER_SIZE`, threaded through viewer config) and the
  editor CSS, so a point looks identical selected or not.
- Regression tests: point create → adapter receives `PointSelector` with exact click
  coords; load `PointSelector` → select → deselect without moving → save produces
  identical selector; drag → new coords.

**Phase 3 acceptance:** in the demo, at any zoom level, clicking with the point tool
creates an annotation whose stored target is `{type: 'SpecificResource', source: <canvas>,
selector: {type: 'PointSelector', x, y}}` with `x`/`y` within 1 canvas px of the click;
points render as circular markers in create mode, edit mode, and read-only mode.

---

## Phase 4 — Configuration surface and custom body editor

### 4.1 Custom body editor (F29 — user feature request)
New config option; when present it replaces the built-in bodies UI inside the editor
card (selection, delete button, and card chrome stay plugin-owned):

```ts
interface AnnotationBodyEditorApi {
  annotation: W3CAnnotation;              // full (hydrated) annotation, canvas-space
  bodies: unknown[];                       // current bodies, untyped — host owns the shape
  context: AnnotationEditorRuntimeContext; // manifest/canvas/user/hostContext
  isHydrating: boolean;
  save: (bodies: unknown[] | unknown) => Promise<void>; // persists via the store
  cancel: () => void;
  requestDelete: () => void;
}

interface AnnotationEditorConfig {
  ...
  bodyEditor?:
    | { component: Component<{ api: AnnotationBodyEditorApi }> }        // Svelte hosts
    | { render: (container: HTMLElement, api: AnnotationBodyEditorApi)  // framework-agnostic
              => (() => void) | void };                                  // returns cleanup
}
```

- The `render` variant is required for the web-component/IIFE consumers (React, vanilla,
  Django templates, …) — they get a DOM node inside the panel and mount whatever they
  want. Re-invoked (after cleanup) when the selected annotation changes; the API object
  is stable per selection.
- **Bodies become opaque when a custom editor is used**: the plugin must stop assuming
  `{purpose, value}` shape. `updateAnnotationBodies` takes `unknown[] | unknown` and
  writes it through verbatim; the built-in editor keeps its `W3CAnnotationBody` typing
  and its empty-value filtering, but that filtering moves **into** the built-in editor
  (fixing the structured-body deletion noted in F29).
- The built-in editor is extracted into its own component (`DefaultBodyEditor.svelte`)
  implementing the same `api` prop — proving the interface and simplifying the panel.

### 4.2 UI knobs (F30)
```ts
ui?: {
  showModeToggle?: boolean;      // default true; false → always-create or always-edit
  startInCreateMode?: boolean;   // default false
  showUndoRedo?: boolean;        // default true (see 1.7 decision)
  purposes?: string[];           // built-in editor's purpose list, default W3C_PURPOSES
  allowMultipleBodies?: boolean; // default true
}
```
Plus top-level: `defaultMotivation` (2.4), `pointStyle` (3.4), and
`target?: 'panel' | 'flyout'` + `position?` passed through to `createPanelPlugin`/
`createFlyoutPlugin` — the plugin system already supports flyouts, and a point-only
tagging tool is a natural flyout.

### 4.3 Reactive extension context (F16)
Give hosts an explicit invalidation channel instead of hoping for reactivity:

```ts
interface AnnotationEditorExtension<HostContext> {
  ...
  /** Subscribe to host-context changes; call the callback to re-evaluate
      canCreate/getCreateDisabledReason. Return an unsubscribe. */
  subscribe?: (invalidate: () => void) => () => void;
}
```

Controller: a `contextVersion = $state(0)` bumped by the callback and read inside the
`$derived.by` gates. Svelte hosts can alternatively back `getContext()` with `$state`
and it now composes correctly; document both.

### 4.4 Scoped events (F15)
Replace `window` CustomEvents with a per-viewer channel on `ViewerState` (it's already
the shared context between OSDViewer and the plugin):

```ts
// viewer.svelte.ts
annotationEditBus = {
  requestEdit: (annotationId: string) => void,   // OSDViewer → plugin
  activeEditAnnotationId: string | null,          // plugin → OSDViewer ($state)
};
```

`activeEditAnnotationId` as reactive state also deletes the event-listener plumbing in
`OSDViewer.onMount`. Keep dispatching the old window events for one release as a
deprecated shim if anything external listens (document removal).

### 4.5 Types cleanup (F21)
- Generic host-facing types: `AnnotationEditorConfig<TBody = W3CAnnotationBody,
  THostContext = unknown>`; extension hooks typed in terms of `W3CAnnotation` instead of
  `any`.
- `W3CAnnotation.target` widened: `target: W3CTarget | W3CTarget[]`, selector union
  (`FragmentSelector | PointSelector | SvgSelector | ...`), `body?: TBody | TBody[]`.
- Remove `__fullBodyLoaded`/`__bodyPreview` from the exported type (internal after 1.4);
  keep accepting them on `load()` results for compatibility.

**Phase 4 acceptance:** a demo-consumer example reproducing the user's project: point
tool only, flyout target, custom body editor mounting a plain-DOM form writing a
structured JSON body — round-trips through `LocalStorageAdapter` unmodified. Docs pages
for body editors, UI config, and extension reactivity.

---

## Phase 5 — Hardening, CSS, tests, docs

- **CSS single-source (F23):** import `@annotorious/openseadragon/annotorious-openseadragon.css?inline`
  and inject that string (shadow-root aware, as today); delete the vendored minified
  copy; drop the duplicate side-effect import in the panel. Verify in the element build
  (shadow DOM) — this is the same constraint class as the existing
  `emitCss:false` element-build handling.
- **Test suite (F28):** mocked-adapter integration tests for the full manager lifecycle
  (init → draw → edit → canvas change → reload → delete → destroy), the store (id
  reconciliation, rollback, per-id serialization), point round-trips, tool config, body
  editor API; a Playwright flow in the demo covering rectangle + point + custom body
  editor + reload persistence.
- **Docs:** rewrite the Annotation Editor section around the v2 adapter contract,
  point behavior, config reference table, body-editor recipes (Svelte + vanilla),
  migration notes (adapter display-sync removal, undo/redo semantics, deprecated window
  events).

---

## Suggested sequencing & scope notes

| Phase | Theme | Risk | Public API change |
|---|---|---|---|
| 1 | Correctness/lifecycle | Low — internal | None |
| 2 | Adapter v2 + store | Medium — refactor of persistence core | Additive (return types, `onPersistenceError`) + adapter display-sync behavior change |
| 3 | IIIF points | Medium — Annotorious interop | Additive (`pointStyle`); stored format becomes spec-true |
| 4 | Config + body editor | Medium — new surface, keep it minimal | Additive (`bodyEditor`, `ui`, `subscribe`, `target`) |
| 5 | Hardening | Low | Deprecations only |

Phases 1–2 unblock "adapter for an annotation server without the adapter being
significant". Phase 3 delivers the point requirement. Phase 4 delivers the point-only +
custom-body project configuration.

## Open questions (decide before the relevant phase)

1. **Undo/redo (1.7):** persistence-aware op stack, or remove the buttons for now?
   Recommendation: remove in Phase 1 (small diff, honest UX), implement the op stack as
   part of Phase 2 where the store gives it a natural home.
2. **Point coordinate precision (3.1):** round to integer canvas px (matches IIIF
   examples and cookbook) or preserve floats? Recommendation: integers.
3. **Existing stored data:** old point annotations were already saved as `PointSelector`
   (conversion happened at save time), so Phase 3 needs no data migration — but confirm
   against real project data before deleting the fragment-center fallback in
   `getPointCoordinates` (keep it as a read-compat path for one release).
4. **`purpose`-less structured bodies in the default editor:** should the built-in
   editor display-but-not-edit unknown body shapes instead of hiding them? (It currently
   destroys them on save — F29.) Recommendation: render unknown bodies read-only with a
   note, never filter them out.
