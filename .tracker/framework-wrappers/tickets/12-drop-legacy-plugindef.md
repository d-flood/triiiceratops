## What to build

Remove the Svelte-only `PluginDef` plugin path from the 1.0 surface, and with it every
`Component<any>` annotation reachable from `ViewerState`. This is the structural fix the
wave-1 integration gate identified: without it, no framework subpath can honor the epic's
promise that Svelte is not required at type-check time.

After this ticket, `types/plugin.ts` imports nothing from `svelte`, and the SDK
`iconDescriptor` / `mount` chrome path is the only plugin chrome path.

## Why this exists

`ViewerState` publicly exposes `pluginMenuButtons`, `pluginPanels`, `pluginFlyouts`, and
`registerPlugin(def: PluginDef)`. All four of those types carry `Component<any>` from
`svelte`, so every declaration graph reaching `ViewerState` reaches the `svelte` package.
A consumer with every real dependency installed but without the optional `svelte` peer
fails `skipLibCheck: false` with exactly one error, from `types/plugin.d.ts`.

Omitting members from `ReadonlyViewerState` cannot fix this: `Omit<ViewerState, …>` still
forces the full `ViewerState` declaration to resolve, so the `svelte` import comes along
regardless. The only fix is for no `Component<any>` to be reachable from `ViewerState`.

The three chrome types are **not** legacy — they are the live types both paths share, and
each already carries an SDK-path field beside its `PluginDef`-path field. Only `PluginDef`
itself is legacy. Removing `PluginDef` lets the five paired fields go with it, which is
what makes the three live types clean for 1.0.

## Where to start

- Read `packages/core/src/lib/types/plugin.ts`. The `svelte` import is line 1. The nine
  annotations to remove: `PluginMenuButton.icon` (~36); `PluginPanel.icon` (~109) and
  `.component` (~118); `PluginFlyout.icon` (~164) and `.component` (~173); `PluginDef.icon`
  (~207), `.panel` (~213), `.flyout` (~216). Each of the first five has a doc comment
  naming it as the `PluginDef` path and sits next to its SDK equivalent
  (`iconDescriptor?: IconDescriptor`, `mount?: PluginMountThunk`).
- Read `packages/core/src/lib/state/viewer.svelte.ts`: `initialPlugins: PluginDef[]`
  (~503), the chrome arrays (~1928-1934), and `registerPlugin` (~2170) with the chrome
  objects it builds (~2193-2240). Compare against the SDK core-chrome registration at
  ~2284-2327, which pushes into the **same three arrays** and must keep working unchanged.
  Check `unregisterPlugin` (~2337) and the reset at ~2363 carefully — they are shared by
  both paths, so they stay.
- Read the legacy render sites, which are the only consumers of the removed fields:
  `PanelStackSection.svelte` (~78-80 `panel.icon`, ~98 `panel.component`),
  `Toolbar.svelte` (~789 `LegacyIcon`, ~809 `Flyout = flyout.component`), and
  `TriiiceratopsViewer.svelte` (~987-996, ~1580-1581, ~1620-1621).
- Read the legacy activation effect in `TriiiceratopsViewer.svelte` — ticket 04 rewrote it
  to key on plugin object reference through a `Map<PluginDef, string>`. That entire effect
  and its `onDestroy` teardown go away; the SDK effect ticket 04 also rewrote **stays**.
  Read the `allPlugins` derived and its two `.filter(...)` deriveds (~217-220).
- Read `packages/core/src/packaging/dtsSvelteImports.ts` — its
  `ALLOWED_SVELTE_IMPORTS_BY_FILE` exception for `types/plugin.d.ts` is what this ticket
  makes unnecessary.

## Contract

- `PluginDef` is deleted from `packages/core/src/lib/types/plugin.ts` and from core's
  public exports in `packages/core/src/lib/index.ts`.
- All nine `Component<any>` annotations are removed, along with
  `import type { Component } from 'svelte'`. `types/plugin.ts` imports nothing from
  `svelte` afterward.
- `PluginUiTarget` **stays exported and unchanged**. It is not part of the legacy path:
  `@triiiceratops/plugin-sdk`'s `definePlugin.ts` and `testing/context.ts`, and
  `@triiiceratops/plugin-annotation-editor`'s `types.ts`, all consume it. Likewise
  `IconDescriptor`, `PluginMountThunk`, `PluginSurface`, and `SdkPlugin` are untouched.
- `ViewerState.registerPlugin` is removed. `unregisterPlugin`, the three chrome arrays, and
  the chrome reset stay — the SDK path uses all of them.
- The custom element's `plugins` prop narrows from `Array<PluginDef | SdkPlugin>` to
  `readonly SdkPlugin[]`, in both
  `packages/core/src/lib/components/TriiiceratopsViewerElement.svelte` and the substrate's
  `packages/core/src/lib/framework/props.ts`. Its entry in the element's
  `<svelte:options customElement props>` map is otherwise unchanged.
- The legacy activation effect and its `onDestroy` teardown are removed from
  `TriiiceratopsViewer.svelte`. Ticket 04's identity-keyed **SDK** effect stays exactly as
  it is, including its `onDestroy`. Do not re-unify or refactor it while you are in here.
- The legacy render branches are removed. Where a branch was `{#if iconDescriptor}…{:else if
icon}`, the `iconDescriptor` branch becomes unconditional; the SDK path's rendering must
  not change behavior.
- `ALLOWED_SVELTE_IMPORTS_BY_FILE`'s `types/plugin.d.ts` entry is removed from the ticket-03
  guard, so a reintroduced `svelte` import there fails the build.
- **Also close the guard hole wave 1 recorded.** The guard's `**/*.svelte.d.ts` allowance is
  extension-based, so it cannot distinguish a compiled Svelte component's declaration (which
  may legitimately import `svelte`, for the `.` entry's Svelte consumers) from a `.svelte.ts`
  rune module's declaration (which may not). `dist/state/viewer.svelte.d.ts` is a rune module
  reachable from the Svelte-free subpaths and currently slips through. Distinguish them by
  whether the originating source file is `*.svelte` or `*.svelte.ts`.
- Documentation stops teaching `PluginDef`: `docs/plugins.md`, `docs/plugin-authoring.md`,
  and `docs/configuration.md`. Regenerate the docs-examples fixtures rather than editing
  `test-consumers/fixtures/docs-examples/generated/*` by hand.
- Add a changeset. This is a **breaking change** to core's public API and must say so.

## Out of scope

- Do not remove, rename, or re-shape `PluginUiTarget`, `IconDescriptor`, `PluginMountThunk`,
  `PluginSurface`, `SdkPlugin`, or any other SDK-path type.
- Do not change SDK plugin activation semantics, chrome registration, ordering, compatibility
  negotiation, `PluginError` channels, or ADR 0010 fail-closed behavior.
- Do not touch ticket 04's identity-keyed SDK effect beyond deleting the legacy sibling.
- Do not unify the plugin SDK's and core's chrome models, and do not refactor the plugin SDK.
- Do not add a deprecation shim, a compatibility adapter, or a runtime warning for removed
  `PluginDef` usage. It is gone.
- Do not start ticket 06 or 07.

## Acceptance criteria

- [ ] `packages/core/src/lib/types/plugin.ts` contains no `svelte` import and no `Component` annotation.
- [ ] No `.d.ts` reachable from `triiiceratops/testing` or `triiiceratops/selectors` — and, once they exist, `triiiceratops/react` and `triiiceratops/vue` — imports from `svelte` or `svelte/reactivity`, and the ticket-03 guard enforces it with no per-file exception for `types/plugin.d.ts`. **The `.` entry is exempt**: it is the Svelte-consumer entry (`package.json` maps the `svelte` condition to it) and deliberately exports the compiled `TriiiceratopsViewer` component, whose declaration legitimately imports `svelte`.
- [ ] The guard distinguishes compiled `*.svelte` declarations from `*.svelte.ts` rune-module declarations; a planted `svelte` type import in `dist/state/viewer.svelte.d.ts` now **fails** the build (verify, then revert the planted import).
- [ ] A consumer project with every real dependency installed but **no `svelte` package** type-checks the Svelte-free entry points — `triiiceratops/selectors` and `triiiceratops/testing` — under `skipLibCheck: false` with zero errors. This is the criterion the whole ticket exists for; verify it directly, do not infer it. Measure the `.` entry too and record its count, but do not treat a residual there as a failure of this ticket: `.` re-exports the compiled Svelte component and TypeScript resolves its single `types` condition regardless of the `svelte` export condition. Giving `.` a component-free `types` target is a packaging decision belonging to ticket 10, not here.
- [ ] SDK plugin chrome is unaffected: menu buttons, panels, and flyouts registered through `iconDescriptor`/`mount` still render, open, close, and tear down exactly as before.
- [ ] Ticket 04's identity-keyed SDK activation behavior still holds, and its tests still pass with only the legacy-path cases removed.
- [ ] Core, plugin SDK, and every workspace package's checks, lints, and suites pass; the API report is regenerated and reviewed; a changeset records the breaking change.

Run:

```sh
pnpm --filter triiiceratops check
pnpm --filter triiiceratops test
pnpm --filter triiiceratops lint
pnpm --filter triiiceratops build:lib
pnpm --filter triiiceratops build:element
pnpm check
pnpm test
pnpm api:report
pnpm api:check
pnpm docs:examples
pnpm docs:examples:check
```

Success is every command exiting `0`, `api-reports/core.api.md` showing `PluginDef` and
`registerPlugin` removed with no unintended drift, and the no-Svelte `skipLibCheck: false`
consumer check passing.

## Blocked by

None — but it blocks 06, 07, and 10.
