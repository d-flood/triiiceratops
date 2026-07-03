# Slice 10 — Adapter authoring kit (conformance tests + reference docs)

- **Phase:** 2 (Adapter API v2)
- **Status:** not started
- **Depends on:** slice-06, slice-07 (contract must be final)
- **Findings:** F28 (adapter-contract part); closes out the "minimal adapter" goal
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §2.6

## Goal

An adapter author can verify their implementation with one import, and the docs walk
through a complete, runnable server adapter.

## Files

- `src/lib/plugins/annotation-editor/testing/index.ts` (new subpath export)
- `package.json` (`exports["./plugins/annotation-editor/testing"]`)
- `src/lib/plugins/annotation-editor/testing/adapterContract.test.ts` (runs the suite
  against `LocalStorageAdapter` and an in-memory mock-server adapter)
- `docs/plugins.md` (adapter authoring section — the full docs rewrite is slice-18, but
  the contract reference and the fetch example land here)

## Implementation

1. **Conformance helper** (framework: vitest — declare `vitest` a peer/dev expectation
   and import `describe/it/expect` from `'vitest'` inside the helper):

   ```ts
   import { runAdapterContractTests } from 'triiiceratops/plugins/annotation-editor/testing';
   runAdapterContractTests(() => new MyAdapter(...), {
     supportsIdReconciliation?: boolean,
     supportsHydrate?: boolean,
   });
   ```

   Coverage: load-empty; create → load round-trip (annotation content preserved
   verbatim, including structured/unknown body shapes); update; delete; id
   reconciliation semantics when opted in (created id honored by subsequent
   update/delete); hydrate skeleton→full when opted in; isolation between
   manifest/canvas keys.
2. **Packaging.** Add the subpath to `package.json#exports` pointing into `dist`;
   confirm `svelte-package` emits it and `pnpm check:runtime-deps` passes (vitest must
   not become a runtime dep of the main entry — keep the testing entry fully isolated).
3. **Docs.** In `docs/plugins.md`:
   - The minimal contract, stated plainly: five pure functions, no display wiring, no
     id bookkeeping, no timestamp/attribution stamping — the plugin does all of that.
   - A complete fetch-based example against the W3C Annotation Protocol shape (POST to
     container reading the `Location`/returned id → return the canonical annotation;
     PUT; DELETE), including error propagation (throw and let the plugin's error
     surface handle it).
   - A short "test your adapter" section using the conformance helper.

## Tests

- The conformance suite itself, run against `LocalStorageAdapter` (with
  `supportsHydrate: true`) and an in-memory server-style adapter (with
  `supportsIdReconciliation: true`) — both green.

## Acceptance

- `pnpm build:lib` succeeds and the testing subpath resolves from `dist` (spot-check
  with a node resolve or the demo-consumer tsconfig).
- `pnpm exec vitest run src/lib/plugins/annotation-editor` green.

## Completion notes

_(fill in when done)_
