# Slice 13 — Custom body editor

- **Phase:** 4 (Configuration & body editor)
- **Status:** not started
- **Depends on:** slice-05 (store), slice-08 (save/error paths) — points slices not required
- **Findings:** F29
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §4.1
- **Decision applied:** D4 — the built-in editor renders unknown body shapes read-only
  with a note; it never filters them out on save.

## Goal

Hosts with complex/structured annotation bodies can replace the built-in bodies UI with
their own widget — as a Svelte component or, for web-component/vanilla consumers, a
plain DOM mount — while the plugin keeps owning selection, deletion, and persistence.

## Files

- `src/lib/plugins/annotation-editor/types.ts` (API + config types)
- `src/lib/plugins/annotation-editor/AnnotationEditorPanel.svelte` (slotting + DOM host)
- `src/lib/plugins/annotation-editor/DefaultBodyEditor.svelte` (new — extracted built-in)
- `src/lib/plugins/annotation-editor/AnnotationEditorController.svelte` /
  `AnnotationManager.svelte.ts` (opaque-body save path)
- `src/lib/plugins/annotation-editor/index.ts` (export types + `DefaultBodyEditor`)
- tests; a demo-consumer example is the Phase-4 acceptance (see slice-14)

## Implementation

1. **The API object** (stable per selection):

   ```ts
   interface AnnotationBodyEditorApi {
     annotation: W3CAnnotation;               // full (hydrated) annotation, canvas-space
     bodies: unknown[];                        // current bodies — host owns the shape
     context: AnnotationEditorRuntimeContext;  // manifest/canvas/user/hostContext
     isHydrating: boolean;
     save: (bodies: unknown[] | unknown) => Promise<void>;  // persists via the store
     cancel: () => void;
     requestDelete: () => void;
   }
   ```

2. **Config:**

   ```ts
   bodyEditor?:
     | { component: Component<{ api: AnnotationBodyEditorApi }> }         // Svelte hosts
     | { render: (container: HTMLElement, api: AnnotationBodyEditorApi)   // framework-agnostic
               => (() => void) | void };                                   // returns cleanup
   ```

   The `render` variant is mandatory for IIFE/web-component consumers (React, vanilla,
   server-rendered apps): the panel gives them a DOM node inside the editor card.
   Cleanup is invoked and `render` re-invoked when the selected annotation changes;
   `isHydrating` flips are delivered by re-invoking with the updated api object (document
   this — DOM hosts re-render cheaply; don't add a subscription surface).
3. **Bodies become opaque when a custom editor is used.** `updateAnnotationBodies`
   (manager/store) accepts `unknown[] | unknown` and writes it through verbatim — no
   `{purpose, value}` assumptions, no filtering.
4. **Extract `DefaultBodyEditor.svelte`** from the panel's current bodies UI,
   implementing the same `api` prop (proves the interface). Its empty-`value` filtering
   moves inside it and applies **only** to bodies it created/edited; unknown body shapes
   (no string `value`, unrecognized `type`) render as a read-only entry with an i18n'd
   note and pass through save untouched (D4 — today they are silently destroyed).
5. Panel keeps: editor-card chrome, delete button + confirm modal, hydration note.
   Everything inside the card body is the (default or custom) body editor.

## Tests

- Custom `component` editor receives the api; `save(customStructuredBody)` → adapter
  `update` receives it verbatim (object, no `value` key — the F29 destruction case).
- `render` variant: mount called with a container; cleanup called on annotation switch
  and on deselect; re-invoked with fresh api after hydration completes.
- DefaultBodyEditor: unknown body shape survives an edit-and-save of a sibling
  `TextualBody` (regression for the silent-deletion bug).
- `cancel`/`requestDelete` proxy to the existing controller handlers.

## Acceptance

- `pnpm exec vitest run src/lib/plugins/annotation-editor` green; `pnpm check` clean.
- Manual: demo with a `render`-variant editor building a plain-DOM form that writes
  `{type: 'Dataset', value: {…}}`-style structured bodies — round-trips through
  `LocalStorageAdapter` unmodified.

## Completion notes

_(fill in when done)_
