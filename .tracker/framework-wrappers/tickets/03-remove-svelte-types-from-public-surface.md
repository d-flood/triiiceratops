## What to build

Remove Svelte from core's published _type_ surface so a React or Vue consumer can use
`triiiceratops` declarations with no `svelte` package installed. Today the declaration graph
reachable from viewer state and plugin inputs imports `svelte/reactivity` and `svelte`, which
makes Svelte a type-time requirement and contradicts the framework-wrapper promise.

## Where to start

- Read `packages/core/dist/state/viewer.svelte.d.ts` line 1 and the four members it types:
  `visibleAnnotationIds` (~54), `userAnnotations` (~65), `loadedManifestIds` (~71),
  `selectedChoices` (~116). Their declarations come from `src/lib/state/viewer.svelte.ts`
  lines 104, 116, 123, 273.
- Confirm the inheritance that makes the fix safe: `SvelteSet extends Set` and
  `SvelteMap extends Map` in the Svelte source (`src/reactivity/set.js`, `map.js`).
- Read `packages/core/dist/types/plugin.d.ts` line 1: `import type { Component } from
'svelte'`. Check where `Component` is used — it appears only on the legacy path
  (`PluginMenuButton.icon`, `PluginPanel.icon`/`component`, `PluginFlyout.icon`/`component`,
  `PluginDef.icon`/`panel`/`flyout`). `SdkPlugin` (~556) is entirely Svelte-free.
- Read the state inventory (`src/lib/state/state-inventory.ts`) — the reactive-collection
  invariant moves there and into documentation.

## Contract

- Annotate the four members with the plain built-ins (`Set<string>`, `Map<string, …>`) while
  **still constructing `SvelteSet` / `SvelteMap` at runtime**. Reactivity is unchanged;
  only the declared type widens. `svelte/reactivity` must no longer appear in any `.d.ts`
  reachable from the public entry or the framework subpaths.
- Runtime `instanceof SvelteSet` / `instanceof SvelteMap` checks (e.g. in
  `trackWatchedMembers`) stay as they are.
- Record the traded invariant: the type system no longer prevents assigning a plain `Set`
  over a reactive collection, so the state inventory and docs become its home. ADR 0007
  already documents that direct assignment is an unsupported escape hatch.
- The `Component` leak is resolved by scope, not by rewriting legacy types: the framework
  wrappers' `plugins` prop accepts `readonly SdkPlugin[]` only. Legacy `PluginDef` carries
  Svelte component types _and_ a Svelte runtime requirement, so it is not offered through
  the wrappers. `PluginDef` itself is unchanged for existing Svelte and custom-element
  consumers.
- Add an automated guard so this cannot silently regress: assert that no `.d.ts` reachable
  from core's public entries imports a `svelte*` specifier. Extend
  `packages/core/scripts/check-runtime-deps.mjs` or add a sibling check invoked by the same
  `build:lib` step.

## Out of scope

- Do not widen, narrow, or re-annotate any other `$state` field types.
- Do not convert `SvelteSet` / `SvelteMap` to plain collections at runtime.
- Do not add a `svelte/reactivity` type shim, vendored Svelte types, or a declaration-merging
  hack.
- Do not change `PluginDef`, `PluginPanel`, `PluginFlyout`, or `PluginMenuButton`.
- Do not touch the plugin SDK's declarations.

## Acceptance criteria

- [ ] No `.d.ts` reachable from `triiiceratops`, `triiiceratops/testing`, or the framework subpaths imports from `svelte` or `svelte/reactivity`.
- [ ] An automated check enforces that, runs as part of `build:lib`, and fails when a Svelte type import is reintroduced (verify with a temporary planted import).
- [ ] Reactivity is unchanged: existing tests covering annotation visibility, loaded manifest ids, user annotations, and selected choices pass, including subscription notifications for those members.
- [ ] The state inventory and/or its documentation records that these members must hold reactive collections.
- [ ] Core and plugin SDK type checks and builds pass.

Run:

```sh
pnpm --filter triiiceratops check
pnpm --filter triiiceratops exec vitest run src/lib/state
pnpm --filter triiiceratops build:lib
pnpm --filter @triiiceratops/plugin-sdk check
pnpm --filter @triiiceratops/plugin-sdk build
```

Success is every command exiting `0`, with the new Svelte-type guard passing and provably
failing on a planted import.

## Blocked by

None - can start immediately.
