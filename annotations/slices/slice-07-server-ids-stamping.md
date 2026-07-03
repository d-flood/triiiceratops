# Slice 07 — Server-assigned IDs + attribution stamping

- **Phase:** 2 (Adapter API v2)
- **Status:** not started
- **Depends on:** slice-05, slice-06
- **Findings:** F5, F18
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §2.3, §2.4

## Goal

Adapters backed by real annotation servers (which mint the annotation IRI on POST) can
return the canonical annotation, and the plugin reconciles everywhere. The plugin — not
the adapter — stamps `@context`/`type`/`creator`/`created`/`modified`/`motivation` so
persisted annotations are complete, valid W3C/IIIF regardless of which tool created them.

## Files

- `src/lib/plugins/annotation-editor/types.ts` (adapter contract + `defaultMotivation`
  config; mirror in `adapters/types.ts` re-export)
- `src/lib/plugins/annotation-editor/AnnotationStore.svelte.ts`
- `src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts` (open-annotation id
  swap)
- tests

## Implementation

1. **Widen the contract (backward compatible — `void` stays valid):**

   ```ts
   create(manifestId, canvasId, annotation): Promise<W3CAnnotation | string | void>;
   update(manifestId, canvasId, annotation): Promise<W3CAnnotation | void>;
   ```

2. **Reconciliation in the store.** When `create` returns an annotation (or id string):
   - swap the cache key (`persistedAnnotations`, `hydrationState`) old id → new id;
   - re-inject `manifestsState` with the canonical set;
   - notify the manager (callback or return value of `store.create`) so that, if the
     annotation is currently open in Annotorious, it is re-added under the new id and
     reselected, and the active-edit-id signal is re-emitted with the new id;
   - all subsequent `update`/`delete` use the canonical id.
   If `update` returns an annotation, replace the cached copy (servers may normalize).
3. **Stamping before `create`** (never clobber host-provided values; runs before
   `extension.beforeSave`, which stays last and may override anything):
   - `@context: 'http://www.w3.org/ns/anno.jsonld'`, `type: 'Annotation'`
   - `creator` from `config.user` (id/name), `created` ISO timestamp
   - `motivation` from new `config.defaultMotivation` (default `'commenting'`)
   Before `update`: stamp/refresh `modified`.
4. Add `defaultMotivation?: string` to `AnnotationEditorConfig` and document inline.

## Tests

- Mock server adapter rewriting `temp-…` → `https://server/anno/42`:
  create → cache keyed by the server id; subsequent body save calls `update` with the
  server id; delete calls `delete` with the server id; `manifestsState` holds the
  canonical id; active-edit-id signal re-emitted.
- `create` returning `void` (LocalStorageAdapter path) → local id kept, everything works
  as before.
- Stamping: created annotation reaches the adapter with `@context`, `type`, `creator`
  (from `config.user`), `created`, and `motivation: 'commenting'`; a host-set
  `motivation` is not overwritten; `update` refreshes `modified`.
- Point + drawn rectangle produce uniformly stamped annotations (F18 regression).

## Acceptance

- `pnpm exec vitest run src/lib/plugins/annotation-editor` green, `pnpm check` clean.
- Manual: demo with a logging in-memory adapter that rewrites ids — edit-after-create
  and delete-after-create hit the rewritten id.

## Completion notes

_(fill in when done)_
