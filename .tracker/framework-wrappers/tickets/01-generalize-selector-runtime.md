## What to build

Move the framework-neutral selector runtime into core and generalize it for both plugin
activations and framework wrappers. The runtime must support cheap per-consumer memoized
projections, equality gating of the cached value, two read entry points, selectable
notification cadence, retained consumer errors, one underlying viewer-state subscription,
and idempotent disposal. Existing plugin SDK consumers observe no source break.

## Where to start

- Read the existing selector contracts in `packages/core/src/lib/types/plugin.ts` and the
  runtime in `packages/plugin-sdk/src/selectors.ts` first. The latter is the code being
  moved and generalized.
- Follow runtime ownership through `runActivation` in `packages/plugin-sdk/src/activate.ts`
  and the test viewer context in `packages/plugin-sdk/src/testing/context.ts`. Both call
  the real factory; nothing structurally implements `SelectorRuntime`, so adding members to
  it is safe.
- Read `ViewerState.subscribe` and `trackWatchedMembers` in
  `packages/core/src/lib/state/viewer.svelte.ts` (around lines 2367 and 2415) to see what
  the batched watcher does and does not observe.
- Read ADR 0011 (`docs/adr/0011-selectors-choose-a-notification-cadence.md`) and the
  **Selector cadence** entry in `CONTEXT.md` before implementing cadence.
- Preserve the existing framework adapter expectations in `packages/plugin-sdk/src/react.ts`
  and `packages/plugin-sdk/src/vue.ts`.

## Contract

- Core owns the selector implementation and selector contracts, in a lightweight state
  module with no runtime Svelte import. Core does not depend on the plugin SDK.
- `@triiiceratops/plugin-sdk` continues to export `createSelectorRuntime` and
  `SelectorRuntime` from the same public entry with source-compatible signatures.
- Every runtime owns exactly one `ViewerState.subscribe` registration and fans out from it.
- The runtime creates **cheap per-consumer memoized projection objects** from a
  `(projection, equality)` pair. A framework helper creates a new projection object when
  its inputs change. Projections are never mutated in place by a caller mid-render — there
  is no `update()` or `invalidate()` on a shared selector, because that is a render-phase
  mutation of shared state and tears under React concurrent rendering.
- **Equality gates the cached value, not only notification.** When a recompute produces a
  value that satisfies `equals`, the projection returns the _previously returned reference_.
  This is an intentional, documented change to what `Selector.get()` returns for plugins
  (previously a fresh-but-equal value after any version bump) and is what makes a
  projection a valid React `getSnapshot` with no extra machinery.
- A projection exposes **two read entry points sharing one gated cache**:
    - a version-memoized read, which recomputes only when the runtime's notification version
      has advanced (React's external-store contract);
    - a dependency-driven recompute, which bypasses the version memo but still applies the
      equality gate (Vue's `computed`, where a framework reactive dependency can change with
      no version bump).
- **Cadence** selects which notification wakes a projection:
    - `state` (default): the existing batched, payload-free inventoried-member watcher.
    - `frame`: the live OpenSeadragon instance's own `animation` / `viewport-change` /
      `animation-finish` events. The ticker attaches lazily when an OSD instance appears and
      detaches on teardown or OSD replacement. There is no persistent
      `requestAnimationFrame` loop and an idle viewer costs nothing.
- Cadence is a selector concern only. No `ViewerState` field, state-inventory entry, watched
  member, batching behavior, notification payload, or plugin subscription semantic changes.
- With debug mode on (`ViewerConfig.debug`, not `NODE_ENV`), a `state`-cadence projection
  that reads through `osd` warns **once** and names `cadence: 'frame'` as the fix. Debug mode
  can be switched on after a projection has already been read, so the probe is owed, not
  decided once; with debug off it costs nothing and installs nothing.
- Plugin activations retain isolated runtimes. Projection failures retain `command`
  attribution and listener failures retain `subscription` attribution.
- Consumer projection or equality failures are retained and rethrowable through a read. They
  are never silently converted into a stale selected value.
- Do not add a required member to the existing public `Selector` interface if that would
  break structural third-party implementations. `SelectorRuntime` may gain members.
- Disposal is idempotent, clears fan-out listeners, detaches any frame ticker, and removes
  the underlying state subscription.

## Out of scope

- Do not add React or Vue viewer components, hooks, or composables.
- Do not change the plugin SDK's `selectors.select(fn, equals)` signature or its React/Vue
  adapter signatures. Adding cadence to the SDK is a later convergence step, not this
  ticket.
- Do not create a second selector implementation for framework wrappers.
- Do not change viewer notification timing, payload-free batching, or the state inventory.
- Do not mirror OSD viewport values into `ViewerState` fields.

## Acceptance criteria

- [ ] Core tests demonstrate memoization, default and custom equality, equality gating of the cached value (a stable reference across equal recomputes), both read entry points, dynamic projection replacement, retained errors, one-subscription fan-out, and idempotent disposal.
- [ ] Core tests demonstrate `frame` cadence waking a projection from OSD animation events, the ticker attaching lazily and detaching on teardown and on OSD replacement, and no ticker existing for a viewer with only `state`-cadence projections.
- [ ] A debug-mode warning (`config: { debug: true }`) fires once when a `state`-cadence projection reads through `osd`, and does not fire for `frame` cadence — including when debug mode is switched on after the projection was first read, and in the PUBLISHED package, not only in source-resolved tests.
- [ ] Existing React/Vue plugin SDK adapter and test-kit tests pass without consumer API changes.
- [ ] Plugin command/subscription error attribution remains covered and passing.
- [ ] Core and plugin SDK type checks and builds pass.

Run:

```sh
pnpm --filter triiiceratops exec vitest run src/lib/state/selectors src/lib/plugin/sdk-failure-isolation.test.ts src/lib/state/viewer.subscribe.onError.test.ts
pnpm --filter @triiiceratops/plugin-sdk exec vitest run src/react.test.ts src/vue.test.ts src/testing/kit.test.ts
pnpm --filter triiiceratops check
pnpm --filter @triiiceratops/plugin-sdk check
pnpm --filter triiiceratops build:lib
pnpm --filter @triiiceratops/plugin-sdk build
```

Success is every command exiting `0`, with existing SDK imports and failure-attribution
assertions unchanged from a consumer's perspective.

## Blocked by

None - can start immediately.
