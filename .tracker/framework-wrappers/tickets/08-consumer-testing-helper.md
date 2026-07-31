## What to build

Let framework consumers unit-test their own components that read viewer state, without
mounting a real viewer. Ship a helper from `triiiceratops/testing` that returns a
`ViewerHandle` backed by real viewer state and no DOM, so a consumer's component test looks
like any other store-consuming component test.

## Why this exists

A consumer's `<Sidebar>` calls `useViewerSelector(viewer, …)`. Getting a `viewer` today means
mounting the real custom element, which means OpenSeadragon, a manifest fetch, and a shadow
root. If that is the only path, every consumer either drives Playwright for a unit-level
concern or concludes the viewer is a foreign object bolted into their app.

## Where to start

- Read the existing `triiiceratops/testing` entry and its build (`build:testing`,
  `vite.config.testing.ts`, the `./testing` export in `packages/core/package.json`).
- Read the SDK test kit's harness in `packages/plugin-sdk/src/testing/context.ts`: it already
  assembles real compiled viewer state with recording service doubles and an injectable OSD
  stub. Reuse that machinery rather than inventing a mock viewer.
- Read the **Test viewer context** entry in `CONTEXT.md`: "The harness is fake; the state is
  never fake." That constraint applies here too.
- Read the `ViewerHandle` and `ReadonlyViewerState` types from ticket 05.

## Contract

- The helper returns a `ViewerHandle` whose `state` is a **real** `ViewerState` instance with
  real commands and real batched notifications, and whose selector runtime is a real runtime
  from ticket 01 — registered in the same `WeakMap` the framework helpers consult, so
  `useViewerSelector` works against it unchanged.
- `handle.element` is an inert detached element standing in for the real host. It is documented
  as inert: it dispatches no viewer events and upgrades nothing.
- No DOM registration, no custom element definition, no OpenSeadragon, and no network access.
  An OSD stub is injectable for tests that need `cadence: 'frame'`.
- Usable from both frameworks: React consumers pass the handle directly; Vue consumers wrap it
  in a `ref`.
- Importable from the published package with **no** React, Vue, or Svelte installed, and usable
  from any test runner.
- Disposal is explicit and idempotent, so a test file creating many handles leaks no
  subscriptions.

## Out of scope

- Do not fake or stub `ViewerState`, its commands, or its notifications.
- Do not render the custom element, register it, or simulate its lifecycle events.
- Do not add a testing-library-specific renderer, `render()` helper, or framework-specific
  wrapper component.
- Do not change the SDK test kit's public API or its `PluginContext` shape.
- Do not add React, Vue, or a DOM environment as a requirement of `triiiceratops/testing`.

## Acceptance criteria

- [ ] The helper is exported from `triiiceratops/testing` with a named export and typed declarations.
- [ ] A React test renders a consumer component with the helper's handle, invokes a real command on `handle.state`, and observes a real `useViewerSelector` update.
- [ ] A Vue test does the same through a `ref`-wrapped handle.
- [ ] `cadence: 'frame'` is exercisable through the injectable OSD stub.
- [ ] The helper's module graph imports no React, Vue, or `svelte*` specifier.
- [ ] Disposal is idempotent and removes the underlying subscription.
- [ ] Core checks and the testing build pass.

Run:

```sh
pnpm --filter triiiceratops exec vitest run src/lib/testing
pnpm --filter triiiceratops check
pnpm --filter triiiceratops build:lib
pnpm --filter triiiceratops build:testing
```

Success is every command exiting `0`, with the helper importable from the built `testing`
entry and no framework or Svelte specifier in its graph. Packed verification is ticket 09.

## Blocked by

- 06 (`06-react-framework-wrapper.md`)
- 07 (`07-vue-framework-wrapper.md`)
