# Tracker for framework-wrappers

## Purpose

This document tracks the work required to publish idiomatic React and Vue framework
wrappers over the Triiiceratops custom element and its shared viewer state contract, so
that each framework's consumers get access that feels native to their framework without
installing Svelte at runtime or at type-check time.

## Current Status

Overall status: `In Progress`

Current ticket: None. 12 is resolved and `Completed` — see "Resolution of ticket 12's `.`
entry finding" below. 06, 07, and 08 are all `Completed`; 06 and 07 have passed an
independent verification gate (see "Tickets 06 and 07 verification gate"). 09 and 11 are
now unblocked.

Last updated: 2026-07-31

## Ledger

| Number | Filename                                        | Status                                 | Depends On     |
| ------ | ----------------------------------------------- | -------------------------------------- | -------------- |
| 01     | `01-generalize-selector-runtime.md`             | Completed                              | None           |
| 02     | `02-custom-element-state-bridge.md`             | Needs Human Validation or Intervention | None           |
| 03     | `03-remove-svelte-types-from-public-surface.md` | Completed                              | None           |
| 04     | `04-identity-keyed-plugin-activation.md`        | Completed                              | None           |
| 05     | `05-framework-wrapper-substrate.md`             | Completed                              | 01, 02, 03     |
| 12     | `12-drop-legacy-plugindef.md`                   | Completed                              | None           |
| 06     | `06-react-framework-wrapper.md`                 | Completed                              | 05, 12         |
| 07     | `07-vue-framework-wrapper.md`                   | Completed                              | 05, 12         |
| 08     | `08-consumer-testing-helper.md`                 | Completed                              | 06, 07         |
| 09     | `09-packed-framework-consumers.md`              | Not Started                            | 04, 06, 07, 08 |
| 10     | `10-public-api-release.md`                      | Not Started                            | 09, 12         |
| 11     | `11-framework-wrapper-docs.md`                  | Not Started                            | 06, 07, 08     |

Ticket 12 was added mid-epic, after the wave-1 gate proved that the epic's "no Svelte at
type-check time" promise is unreachable while `ViewerState` references `PluginDef` and the
`Component<any>`-annotated chrome fields. The owner's decision was to drop the Svelte-only
`PluginDef` path for 1.0 rather than introduce a structural stand-in type. This supersedes
ticket 03's "Do not change `PluginDef`, `PluginPanel`, `PluginFlyout`, or `PluginMenuButton`"
constraint and the SPEC's statement that the leak is "resolved by scope"; see the
**Superseded decisions** section of `SPEC.md`.

## Notes

Tickets 01 through 04 have no dependencies and are each independently shippable:

- 01 generalizes the selector runtime into core and adds selector cadence (ADR 0011).
- 02 completes the custom element's state bridge and `searchProvider` as a low-level feature.
- 03 removes Svelte from core's published type surface — a prerequisite for the promise that
  framework consumers never need Svelte, and a standalone correctness fix.
- 04 fixes a pre-existing core defect: plugin activation lifetime was keyed to the identity of
  the plugins array rather than to plugin identity, so any host re-evaluating its list per
  render restarted every plugin.

Tickets 06 and 07 can proceed in parallel once 05 lands.

Ticket 02's implementation and tests are complete and every command in its Run block passed
except the last: `playwright test tests/wc-parity.spec.ts` passes on **chromium** and
**firefox** but cannot launch **webkit** on this machine — Playwright reports missing system
libraries (`libgstreamer-plugins-bad1.0-0`, `libflite1`, `libavif16`, `gstreamer1.0-libav`)
and installing them needs root. Re-run that one command on a machine with
`playwright install-deps` to close the ticket.

### Wave 1 integration gate (tickets 03, 01, 02, 04 composed)

Verified together on branch `react-and-vue-adapters`: both packages' `check`, `lint`, and full
test suites (core 633, plugin-SDK 71), `build:lib`, plugin-SDK `build`, `build:element`,
`build:testing`, the workspace-wide `pnpm check`, every other package's suite, `format:check`,
`api:report` (no snapshot drift) and `api:check` all pass. `wc-parity.spec.ts` passes on
chromium and firefox; webkit still cannot launch here (see the note above), which is the only
reason ticket 02 is not `Completed`. The `dts-svelte-types` guard was confirmed to run at the
end of `build:lib` and to fail the build on a planted `import type { Component } from 'svelte'`
in `dist/state/selectors/runtime.d.ts` (the planted import was reverted).

Two things ticket 05 must know, found only by composing 01 with 03:

1. **`triiiceratops/selectors` is NOT Svelte-free at type time.** The new subpath's declaration
   graph reaches `dist/types/plugin.d.ts` twice — `state/selectors/runtime.d.ts` imports
   `ViewerSelectors` from it, and `ViewerState` itself imports `PluginDef`/`PluginPanel`/
   `PluginFlyout`/`PluginMenuButton` from it — and that file carries the
   `Component` type import from `svelte` that ticket 03's guard deliberately allowlists. A
   consumer with every real dependency installed but without the optional `svelte` peer fails a
   `skipLibCheck: false` type-check with exactly one error, from `types/plugin.d.ts`. The fix is
   structural (de-Svelte or split the legacy plugin types) and was out of scope for 01 and 03;
   ticket 05/10 cannot deliver the "no Svelte at type-check time" promise until it is done.
2. **The guard's `.svelte.d.ts` allowance is extension-based, so it does not distinguish a
   compiled Svelte component from a `.svelte.ts` rune module.** A planted `Component` type
   import from `svelte` in `dist/state/viewer.svelte.d.ts` — reachable from the
   Svelte-free `./selectors` entry — passes the guard. Only `svelte/reactivity` is hard-forbidden
   there. Tighten this before relying on the guard for the framework subpaths.

### Resolution of ticket 12's `.` entry finding

The ticket-12 gate correctly reported that acceptance criteria 2 and 4 were not literally
met on the `.` entry: a no-Svelte consumer type-checking `import type { ViewerState } from
'triiiceratops'` under `skipLibCheck: false` still gets one error, from
`dist/components/TriiiceratopsViewer.svelte.d.ts`.

That was a defect in the criteria, not in the work. Criteria 2 and 4 were written against
`triiiceratops` as a whole, but `.` **is** the Svelte-consumer entry — `package.json` maps
the `svelte` export condition to it, and it deliberately exports the compiled
`TriiiceratopsViewer` component, whose declaration legitimately imports `svelte`. SPEC user
story 8 scopes the promise to a _framework consumer_, who imports `triiiceratops/react` or
`triiiceratops/vue`, never `.`. The residual is pre-existing (byte-identical at `1e5cb1a`)
and the entry went from two errors to one because ticket 12 removed the one it owned.

Both criteria were amended to be per entry point, and ticket 12 is `Completed`. Making `.`
itself Svelte-free would require giving it a component-free `types` target for non-Svelte
conditions — a packaging and public-API change that belongs to ticket 10 if it is wanted at
all. It is **not** currently planned.

### Ticket 12 outcome — what 06, 07, and 10 must know

`PluginDef` is gone, and with it `definePlugin`/`createPanelPlugin`/`createFlyoutPlugin`
(core's, not the SDK's), `ViewerState.registerPlugin`, the constructor's third
`initialPlugins` parameter, and the `icon`/`component` fields on `PluginMenuButton`,
`PluginPanel`, and `PluginFlyout`. `types/plugin.ts` imports nothing from `svelte`.
`PluginUiTarget`, `IconDescriptor`, `PluginMountThunk`, `PluginSurface`, `SdkPlugin`,
`unregisterPlugin`, the three chrome arrays, and the chrome reset are all untouched.
`registerSdkChrome` is now the only writer of the chrome arrays, and the state inventory
lists it in place of `registerPlugin` for `pluginMenuButtons`/`pluginPanels`/
`pluginFlyouts`/`pluginUiState`.

Two corrections to what wave 1 recorded, both found by measuring rather than inferring:

1. **Wave-1 note 1's "exactly one error from `types/plugin.d.ts`" was measured against the
   Svelte-FREE subpaths, not against `triiiceratops` itself.** Re-measured on HEAD before
   this ticket, in a real packed consumer with every dependency installed and no `svelte`:
   `triiiceratops/selectors` + `triiiceratops/testing` under `skipLibCheck: false` reported
   exactly one error, from `types/plugin.d.ts` — and reports **zero** after this ticket.
   The `.` entry reported **two**: that one plus
   `components/TriiiceratopsViewer.svelte.d.ts`, and still reports the latter. That
   residual is not a leak this ticket left behind — the `.` entry deliberately exports the
   compiled Svelte component for its `svelte` export condition, and the ticket-03 guard
   allowlists exactly that. **Tickets 06/07 must therefore not re-export anything from
   `.`'s component surface into `triiiceratops/react` / `triiiceratops/vue`**, or their own
   `types` entries will inherit that error; and ticket 10's type-dependency criterion should
   be stated per entry point, because `.` can only reach zero by splitting its `types`
   condition, which no ticket currently owns.
2. **Wave-1 note 2's guard hole is closed.** `isAllowedSvelteImport` no longer keys the
   compiled-component allowance on the `.svelte.d.ts` extension. It asks whether the
   ORIGINATING source is a `*.svelte` component, which `svelte-package` answers by copying
   that source into `dist` next to the declaration; a `*.svelte.ts` rune module emits only
   `<name>.svelte.js`. Verified both ways on the real `dist`: a planted
   `import type { Component } from 'svelte'` in `dist/state/viewer.svelte.d.ts` now fails
   the build naming the chain, and the build is clean once reverted. Synthetic fixtures in
   `dtsSvelteImports.test.ts` must now write the `.svelte` sibling for a case that expects
   the component allowance. `ALLOWED_SVELTE_IMPORTS_BY_FILE` is now empty and a test pins it
   that way.

Test-porting note for anyone touching plugin chrome tests: `viewer.pluginTarget.test.ts`,
`viewer.pluginPosition.test.ts`, `state-inventory.test.ts`, and `viewer.search.test.ts`
covered SHARED target/position/inventory machinery through `registerPlugin` only because it
was the convenient vehicle. They were ported to `registerSdkChrome`, not deleted — the
machinery is content-agnostic and the coverage is unchanged. Only genuinely legacy-only
cases were deleted (see the ticket-12 commit).

### Ticket 12 verification gate — why the status is not `Completed`

Verified independently of the implementing agent's account, on a freshly packed
`triiiceratops-1.0.0-rc.31.tgz` installed into a throwaway project with every real
dependency present (15 packages) and **zero** Svelte packages, type-checked with
`typescript@5.9.3` under `strict: true`, `moduleResolution: bundler`, `types: []`,
`skipLibCheck: false`:

| Probe                                                          | Result                                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `triiiceratops/selectors` + `triiiceratops/testing`            | **0 errors**, `tsc` exit 0                                                                                 |
| `import type { ViewerState } from 'triiiceratops'` (`.` entry) | **1 error** — `dist/components/TriiiceratopsViewer.svelte.d.ts(38,43) TS2307: Cannot find module 'svelte'` |

Everything else in the ticket verifies clean. All nine commands in the Run block exit 0
(`check`, `test` 712, `lint`, `build:lib`, `build:element`, workspace `check`, workspace
`test`, `api:check`, `docs:examples:check`); plugin-SDK and annotation-editor both build
and pass (71 / 102) and still consume `PluginUiTarget`; `PluginUiTarget`, `IconDescriptor`,
`PluginMountThunk`, `PluginSurface`, `SdkPlugin`, `unregisterPlugin`, the three chrome
arrays, and the chrome reset all survive with their shapes unchanged; ticket 04's
identity-keyed SDK effect diffs byte-for-byte against 503754c apart from losing its legacy
sibling, and its four cases pass; every deleted test case was legacy-path-only and the four
ported files kept their assertions verbatim; the `core.api.md` diff contains no removal
beyond `PluginDef`, the three `PluginDef` helpers, `registerPlugin`, the constructor
parameter, and the nine `Component` fields; the breaking changeset is present and correct.
Both guard criteria were re-verified by planting and reverting real imports in `dist`: a
`svelte` import in `dist/types/plugin.d.ts` now fails (exit 1), and one in
`dist/state/viewer.svelte.d.ts` now fails while the **pre-ticket** guard restored from
1e5cb1a passes the same plant (exit 0) — the hole is genuinely closed, not merely claimed.

So the failure is narrow and structural, not sloppiness:

- **Acceptance criteria 2 and 4 are not literally met for the `.` entry.** `.`'s single
  `types` condition is `dist/index.d.ts`, which re-exports the compiled
  `TriiiceratopsViewer.svelte`; TypeScript resolves `types` regardless of the `svelte`
  export condition, so a Svelte-free consumer reaches
  `import("svelte").Component<Props, {}, "viewerState">`.
- **This is pre-existing, not regression.** That exact declaration is byte-identical in
  `api-reports/core.api.md` at 1e5cb1a and at HEAD, and `index.ts` exported the component
  before this ticket. The `.` entry went from two errors to one; ticket 12 removed the one
  it owned.
- **No in-scope fix exists.** Reaching zero on `.` means giving it a component-free `types`
  target for non-Svelte conditions — a packaging and public-API decision the ticket's
  Contract and Out of Scope do not authorize, and most naturally ticket 10's.

**Owner decision needed:** either (a) accept the criteria as per-entry-point — `.` is the
Svelte-consumer entry and keeps its component type; `./selectors`, `./testing`, and the
future framework subpaths are provably Svelte-free — and hand the `.` split to ticket 10,
or (b) authorize the `.` `types` split now. Nothing in ticket 12's own work needs redoing
either way.

**Hard constraint for 06 and 07 in the meantime:** re-export into `triiiceratops/react` /
`triiiceratops/vue` from `framework/index.ts`, `./selectors`, and `types/*` **only**. Do
not re-export anything from `.`'s component surface, or those subpaths' `types` entries
inherit this error and their `skipLibCheck: false` type test fails for a reason unrelated
to them. Confirmed viable: `dist/framework/props.d.ts` type-checks to **0 errors** in the
same no-Svelte consumer, so the substrate is already clean.

**Ticket 10** should state its type-dependency criterion per entry point rather than for
`triiiceratops` as a whole.

### Ticket 06 outcome — what 07, 08, 09, and 11 must know

`triiiceratops/react` ships from `packages/core/src/lib/react.ts` (the published entry,
a re-export barrel only) plus `packages/core/src/lib/react/` (implementation and tests:
`context.ts`, `effects.ts`, `handle.ts`, `selector.ts`, `viewer.ts`, `index.ts`). The
split exists because the acceptance criterion demands `dist/react.js` / `dist/react.d.ts`,
which `svelte-package` produces only from a top-level `src/lib/react.ts`. Ticket 07
should mirror it exactly: `src/lib/vue.ts` + `src/lib/vue/`.

Facts worth not rediscovering:

1. **The `./react` exports entry pulls `dist/framework/props.d.ts` into the PUBLIC
   declaration graph, which trips `api:check`.** `manifestJson?: string | Record<string, any>`
   is an `any` on a public declaration; it is the same IIIF/manifesto.js boundary already
   allowlisted for `TriiiceratopsViewer.svelte.d.ts`. Regenerated the txt with
   `node scripts/check-public-api.mjs --write-allowlist` and updated `lint-allowlist.md`
   entry 4 in the same commit, per its stated protocol. **Ticket 07 will not hit this
   again** — `./vue` reaches the same file, which is now listed.
2. **`api:report` adds ~1,000 lines to `core.api.md`** (the whole react entry's reachable
   graph) and one `exports.json` entry. Both are pure additions; a changeset is required
   because `api-reports/` changed.
3. **The distribution-cleanup guard scans doc comments.** A `console.log(...)` inside a
   ` ```ts ` example in `src/lib/**` fails `distribution-cleanup.guard.test.ts`. Write
   examples that call something else.
4. **The global `EventTarget` in core's vitest run is Node's, not happy-dom's.** Spying on
   `EventTarget.prototype.addEventListener` instruments a class no page element inherits
   from and silently counts nothing. Walk the prototype chain of a real element to find the
   owner instead (`prototypeOwning` in `react/strictMode.test.ts`).
5. **React 19 + happy-dom + `react-dom/client` works fine** with `IS_REACT_ACT_ENVIRONMENT`
   and the shared `installInertAnimations()` / `defineRealViewerElement()` / `settle()`
   harness — jsdom was not needed, because no test here turns on upgrade ordering.
   `react-dom/server`'s `renderToStaticMarkup` also works under happy-dom, which is how the
   server/client attribute-parity assertion lives in one file.
6. **`viewererror` has exactly one live emitter** in the viewer today: the nav-edge/toolbar
   conflict (`config: { controls: 'split', toolbar: { anchor: 'top' }, nav: { edge: 'top' } }`).
   A 404 manifest does NOT emit one. Use that config to drive the channel.
7. **`canvasId` is not two-way.** Internal navigation (`state.setCanvas(…)`) does not move the
   element's reflected `canvas-id` attribute, because the element passes `canvasId` one-way
   into the inner viewer. The consumer-visible proof that an unchanged re-render does not undo
   navigation is therefore `element.viewerState.canvasId`, not the attribute.
8. **A plugin activation owns its own `ViewerState.subscribe`.** Any test that counts live
   subscriptions to prove "one subscription" must use a viewer with no plugins, or expect
   wrapper + one per activation.
9. **A `<TriiiceratopsViewer>` with two viewers sharing one handle throws from the second
   viewer's mount effect**, which React surfaces as a failed commit; the root is not
   recoverable afterwards, so such a test must skip the shared `unmount()` teardown.

Verified directly, not inferred: a freshly packed `triiiceratops-1.0.0-rc.31.tgz` installed
into a throwaway project with `react`, `@types/react`, and `typescript@5.9.3` and **zero**
Svelte packages type-checks a real `triiiceratops/react` consumer under `strict`,
`moduleResolution: bundler`, `types: []`, `skipLibCheck: false` with **0 errors**. The same
project still reports the known single `.`-entry error for
`import type { ViewerState } from 'triiiceratops'`, which proves the probe has teeth and
confirms the ticket-12 boundary constraint held.

Mutation-tested, so the suite is not vacuous. Four deliberate defects were planted and every
one was caught: keying the selector `useMemo` on the runtime alone (freezing inline
projections), dropping `controller.destroy()` from the unmount cleanup, recreating the prop
applier on every effect run, and handing callbacks the `CustomEvent` instead of its `detail`.
The `expectTypeOf` assertions in `react/types.test.ts` were confirmed to fail `tsc` when a
claim is wrong, so they are a real gate on `pnpm check`, not decoration.

### Ticket 07 outcome — what 08, 09, and 11 must know

`triiiceratops/vue` ships from `packages/core/src/lib/vue.ts` (the published entry, a
re-export barrel only) plus `packages/core/src/lib/vue/` (implementation and tests:
`context.ts`, `handle.ts`, `selector.ts`, `viewer.ts`, `index.ts`). The layout mirrors
ticket 06's exactly, for the same reason: `svelte-package` produces `dist/vue.js` /
`dist/vue.d.ts` only from a TOP-LEVEL `src/lib/vue.ts`.

**One deliberate divergence from the ticket's Contract, and why.** The ticket says the
template ref "resolves to `ViewerHandle | null`" and shows `viewer.value?.state.…`. Vue's
template-ref mechanism cannot deliver that literally: for a component vnode the renderer
sets the ref to `getComponentPublicInstance(...)`, which is ALWAYS an object once mounted
(`proxyRefs(markRaw(instance.exposed))`, wrapped again in `exposeProxy`) and `null` only
before mount and after unmount. There is no knob — no `expose()` shape, no re-`expose`,
no re-`setRef` — that makes it null during the window between mount and the element
publishing its first `ViewerState`. Typing `state` as non-optional would therefore have
been a lie for exactly that window. The wrapper exposes **exactly the two `ViewerHandle`
members** and the entry point exports

```ts
export interface TriiiceratopsViewerInstance extends Omit<
    ViewerHandle,
    'state'
> {
    readonly state: ReadonlyViewerState | undefined;
}
```

derived from `ViewerHandle` so the two cannot drift. `ViewerHandle` is assignable to it.
Consumers write `viewer.value?.state?.setCanvas(…)` (one more `?.` than the ticket's
sketch) and `useTemplateRef<TriiiceratopsViewerInstance>('viewer')`. **Docs (ticket 11)
must use that form.** The composables accept `ViewerHandleRef`, a structural
`{ readonly value: TriiiceratopsViewerInstance | null | undefined }` rather than
`Ref<…>`, because Vue's `Ref<T, S>` has both a getter and a setter and is therefore
invariant — `Readonly<ShallowRef<TriiiceratopsViewerInstance | null>>` would not be
assignable to `Ref<…>`.

Facts worth not rediscovering:

1. **The attribute tier must be `^`-prefixed in the vnode props.** Vue's
   `shouldSetAsProp` ends in `key in el`, so a bare `theme` becomes `el.theme = …` once
   the element is upgraded and `setAttribute('theme', …)` when it is not — the same prop
   taking different paths depending on whether the lazy registration import has resolved.
   `'^theme'` is Vue's own force-as-attribute marker: `patchProp` strips it and always
   calls `setAttribute`, and `@vue/server-renderer`'s `ssrRenderAttrs` strips it too
   (`if (key.startsWith("^")) key = key.slice(1)`), so the server's markup and every
   client render agree. Removing the prefix fails the server/client attribute-parity test.
2. **Vue's runtime compiler auto-detects ALREADY-registered custom elements** —
   `compileToFunction` installs a default `isCustomElement: tag => !!customElements.get(tag)`.
   So a test that writes the raw tag in a template only warns while the element is
   unregistered. `vue/compilerOptions.test.ts` runs its contrast case FIRST and asserts
   `isRealViewerElementDefined() === false` at that moment, so the file cannot silently
   pass if its order changes.
3. **Vue's `emit()` is a no-op on an unmounted instance** (`if (instance.isUnmounted) return`),
   so a leaked DOM listener is INVISIBLE through emits — dropping the wrapper's
   `removeEventListener` loop broke nothing consumer-visible. `vue/lifecycle.test.ts`
   measures the resources directly instead, with ticket 06's `prototypeOwning()` trick and
   a `ViewerState.prototype.subscribe` counter.
4. **`ref(obj)` deep-wraps.** A test (or a consumer) that passes a property-tier object
   through a plain `ref` hands the wrapper a `reactive` PROXY, not the original object, so
   identity assertions fail. Use `shallowRef` for property-tier values.
5. **A component's own `provide()` is not visible to its own `inject()`.** A setup that
   calls `provideViewer(viewer)` must still pass `viewer` explicitly to composables in the
   SAME setup; only descendants resolve it by injection.
6. **Vue's `computed` throws once and then serves its last cached value.** After a
   projection failure surfaces (correctly) through `onErrorCaptured` /
   `app.config.errorHandler`, a later read with no new invalidation returns the previously
   cached selection — that is Vue's caching, not the wrapper's. The discriminating
   assertion for "no stale value" is therefore: every subsequent INVALIDATION throws again,
   and once the consumer's bug is fixed the selection is current state, never the value
   cached before the failure. `vue/selector.test.ts` asserts exactly that.
7. **`api:check` needed eight NEW allowlist lines that are NOT the IIIF boundary**: the six
   `(detail) => any` emit-handler props and the trailing `any` type argument of Vue's
   `DefineComponent`, both hard-coded inside `@vue/runtime-core`'s own types
   (`EmitsToProps` maps every emit to `=> any`). They are recorded as **entry 6** in
   `lint-allowlist.md`, separately from entry 4, which gained one genuine IIIF line
   (`dist/vue/viewer.d.ts :: readonly type: PropType<string | Record<string, any>>` — the
   runtime prop declaration `defineComponent` inlines into the component type). The emit
   PAYLOAD types are fully typed and pinned by `vue/types.test.ts`. Name the emit
   validators' parameters properly: they appear verbatim in the published `.d.ts` and in
   consumer autocompletion.
8. **`vue` resolves to the FULL build under core's vitest** (`index.mjs`, via the `node`
   condition), so the runtime template compiler is available and no `vue` alias or feature-
   flag `define` was needed. `vue/server-renderer` resolves in both the happy-dom and the
   `@vitest-environment node` files.

Verified directly, not inferred: a freshly packed `triiiceratops-1.0.0-rc.31.tgz`
installed into a throwaway project with `vue@3.5.40`, `typescript@5.9.3`, and every real
dependency but **zero** Svelte packages type-checks a real `triiiceratops/vue` consumer
(component, template ref, both selector forms, both cadences, all six emits, every
re-exported type) under `strict`, `moduleResolution: bundler`, `types: []`,
`skipLibCheck: false` with **0 errors**. The same project reports the known single
`.`-entry error for `import type { ViewerState } from 'triiiceratops'`, which proves the
probe has teeth and confirms the ticket-12 re-export boundary held.

Mutation-tested, so the suite is not vacuous. Six deliberate defects were planted and every
one was caught: caching the selector runtime outside the `computed` (the `<KeepAlive>`
rewire), using `read()` instead of `recompute()` (the Vue-reactive-dependency and
retained-failure cases), dropping the `^` attribute markers (server/client parity), routing
property-tier values through vnode props (they were stringified into attributes), dropping
the `removeEventListener` loop, and dropping `controller.destroy()`. The `expectTypeOf`
assertions in `vue/types.test.ts` were confirmed to fail `tsc` when a claim is wrong.

#### Tickets 06 and 07 verification gate

Independently re-verified on `react-and-vue-adapters`, all exiting `0`:
`pnpm --filter triiiceratops check`, `test` (812 → 813 tests, see below), `lint`,
`build:lib`, `build:element`, `build:testing`, then workspace `pnpm check`, `pnpm test`,
`pnpm api:check`, `pnpm format:check`, and `pnpm install --frozen-lockfile`.

Beyond re-running the commands, the claims most worth doubting were checked directly, from
a freshly packed tarball rather than from either implementing agent's account:

- **The epic's central promise holds for BOTH entry points at once.**
  `npm pack` in `packages/core` (against the final `dist`) was installed into one throwaway
  project whose only dependencies are the tarball, `react@19.2.7`, `@types/react@19.2.17`,
  `vue@3.5.40`, and `typescript@5.9.3` — 27 top-level `node_modules` entries, none of them
  Svelte. Under `strict`, `moduleResolution: bundler`, `types: []`, **`skipLibCheck: false`**,
  `npx tsc` reports **0 errors** across three consumer files: a `.ts` React consumer using
  every named export of `triiiceratops/react`, a `.ts` Vue consumer using every named export
  of `triiiceratops/vue` (component, `useTemplateRef<TriiiceratopsViewerInstance>`,
  `provideViewer`, `<ViewerProvider>`, both selector forms, both cadences, all six emit
  handler props, `viewer.value?.state?.setCanvas(…)`), and a `.tsx` JSX consumer of the React
  component with `ref`, `className`, `style`, `data-*`, and typed callbacks. The probe has
  teeth: adding one `import type { ViewerState } from 'triiiceratops'` makes the same command
  exit 2 with the known single `.`-entry error
  (`dist/components/TriiiceratopsViewer.svelte.d.ts` imports `svelte`), and removing it
  returns to 0. That residual is ticket 10's, unchanged by 06/07.
- **The artifacts are real and clean.** `dist/react.js`, `dist/react.d.ts`, `dist/vue.js`,
  and `dist/vue.d.ts` all exist; `grep` over them and `dist/react/*`, `dist/vue/*` finds no
  `svelte*` specifier; both were imported in plain Node and export only the expected NAMED
  values (no default export anywhere). No `.tsx` and no `.vue` file exists in the repository.
- **`react` and `vue` are optional peers only** — neither appears in core's `dependencies`.
- **Mutation-tested independently.** (a) Freezing React's projection in a `useRef` across
  renders was caught by two selector tests ("reads current closure values with no useCallback
  or useMemo" and "honours a current inline equality function"). (b) Hoisting Vue's runtime
  resolution outside the `computed` was caught by `vue/keepAlive.test.ts`. Both were reverted
  and `git status` confirmed clean. The `<KeepAlive>` test was read, not trusted: it asserts
  two distinct `viewerstateavailable` details and two distinct `ViewerState` objects, so it
  cannot pass against a viewer that never detached.

One gap was found and closed here (commit follows the implementation commits):

- Ticket 07's stated reason for keeping the property tier out of vnode props is Vue's
  `shouldSetAsProp` falling back to `setAttribute(key, String(value))` **on an element that
  is not yet defined** — and no Vue test could observe that window. Every other file in
  `src/lib/vue/` registers the element in `beforeAll` and runs under happy-dom, which
  implements no upgrade at all, so `key in el` was always true and the risky path was never
  exercised. `vue/propertyTier.upgrade.test.ts` now drives it under `@vitest-environment
jsdom`: it guards the premise (`isRealViewerElementDefined() === false`), mounts the
  wrapper with `manifestJson`, `config`, and a function-valued `searchProvider`, asserts they
  land as PROPERTIES with the consumer's own identity and that no attribute was stringified,
  then defines the tag, lets the platform upgrade the live element, and confirms the values
  reached the inner viewer. Routing those three props through vnode props instead fails it.

### Ticket 08 outcome — what 09 and 11 must know

`createTestViewerHandle()` ships from `packages/core/src/lib/testing/index.ts` — the
existing single-file `triiiceratops/testing` entry, not a new module. Its exported shape:

```ts
export interface TestViewerHandle extends ViewerHandle, ViewerHandleSlot {
    readonly element: TriiiceratopsViewerElement;
    readonly state: ViewerState;
    setOsdViewer(stub: unknown): void;
    dispose(): void;
}
export function createTestViewerHandle(options?: {
    fixtures?: HeadlessViewerFixtures;
}): TestViewerHandle;
```

`ReadonlyViewerState`, `TriiiceratopsViewerElement`, `ViewerHandle`, and `ViewerHandleSlot`
are re-exported from the entry so a consumer's own test helpers need no deep import.

Facts worth not rediscovering:

1. **The handle is deliberately BOTH shapes.** React's `useViewerSelector` takes a
   `ViewerHandleSlot`, Vue's takes a `{ readonly value: TriiiceratopsViewerInstance | null }`.
   Satisfying both is what makes the ticket's "React consumers pass the handle directly;
   Vue consumers wrap it in a `ref`" literally true with no adapter. **Vue consumers must
   use `shallowRef`, not `ref`** — a deep `ref` hands the composable a reactive PROXY of
   the handle, so `handle.state` identity comparisons fail (ticket 07 note 4, same trap).
   Docs (ticket 11) must show `shallowRef`.
2. **It is built on the substrate's real `createViewerHandleSlot()`**, claimed by the inert
   host, publishing the `TestViewerHandle` itself. So `handle.get() === handle`,
   `dispose()` publishes `null` through the real notify path (React re-renders to
   `undefined`), and a test handle mistakenly passed to a real `<TriiiceratopsViewer>`
   raises the real `TriiiceratopsHandleConflictError` rather than binding twice.
3. **The entry imports the substrate's LEAF modules, not `framework/index.js`.** The barrel
   re-exports `registration.js`, whose `import('../triiiceratops-element.js')` cannot
   resolve under `vite.config.testing.ts` (that config has no element-artifact stub, unlike
   `vite.config.ts`), so the barrel would break `build:testing` outright — and bundling the
   registrar would contradict the helper's promise to register nothing. The wave-2 gate's
   prediction that `attachSelectorRuntime` must be added to `framework/index.ts` therefore
   did NOT hold; adding it would have been an unused export. Nothing in the barrel changed.
4. **`build:testing` now ends in `pnpm check:testing-entry`**
   (`packages/core/scripts/check-testing-entry.mjs`), which walks the real
   `dist/testing/index.js` graph and fails on a `react`/`react-dom`/`vue`/`@vue/`/`svelte`
   specifier. The source legitimately imports `svelte` (`flushSync`); only the built
   artifact is guarded. It was verified to have teeth by planting `import "svelte"` and
   `import "react"` into the built chunk (exit 1 both times) and reverting. The real chunk
   has **no bare imports at all**.
5. **The built testing entry cannot be imported in bare Node — `ReferenceError: self is not
defined` — and that is PRE-EXISTING**, from a `cross-fetch`-style polyfill bundled in
   with `manifesto.js`. Confirmed by rebuilding the entry from the pre-ticket source and
   reproducing it byte-for-byte. With `globalThis.self = globalThis` set, the built entry
   imports and `createTestViewerHandle()` works with **no `document` and no
   `customElements`** at all (the inert host falls back to a plain object). Ticket 09's
   packed fixture should either run under a DOM-ish environment (jsdom/happy-dom, which is
   what a React/Vue consumer's test runner already has) or shim `self`; do not read that
   error as a regression from this ticket.
6. **`ViewerConfig` has no `theme` member** (`toolbarOpen`, `locale`, … do), and the
   toolbar state member is `toolbarOpen`, not `toolbarVisible`. Both cost a `check` cycle.
7. **Tests live in `src/lib/testing/`** (`viewerHandle.test.ts`, `react.consumer.test.ts`,
   `vue.consumer.test.ts` — 35 tests) and are pruned from `dist` by `pruneDist`. They mount
   REAL React and REAL Vue against the helper under the default happy-dom environment; no
   custom element is registered in any of them, and each asserts
   `customElements.get('triiiceratops-viewer') === undefined` so the file cannot silently
   start depending on a mounted viewer.

Mutation-tested, so the suite is not vacuous. Four deliberate defects were planted and every
one was caught: dropping `attachSelectorRuntime` (7 failures, including both consumer
suites), dropping `runtime.dispose()` (4), dropping `claim.release()` (3), and publishing a
separate `{ element, state }` object instead of the handle itself (2).

Verified: all five commands in the ticket's Run block plus core `lint` exit 0; core's suite
is 813 → 848; workspace `check`, `test`, `lint`, `format:check`, `api:check`, and
`docs:examples:check` all pass; `api:report` regenerated `core.api.md` (+106/−6, all in the
`dist/testing/index.d.ts` section) and a changeset accompanies it. `build:element` was
re-run after `api:report`, per the build-ordering trap.

### Ticket 05 outcome — what 06, 07, and 08 must know

The substrate lives in `packages/core/src/lib/framework/`, barrelled at
`framework/index.ts`. It is not a published subpath: tickets 06 and 07 add
`triiiceratops/react` and `triiiceratops/vue` and re-export from it. Full public surface,
with usage notes, is in that barrel's exports.

Three corrections to what wave 1 recorded, found while building on it:

1. **`element.plugins = [...]` was NEVER a no-op.** The wave-1 note said `plugins` needed
   adding to `<svelte:options customElement props>` before the property tier could work.
   It did not: `transform-client.js` fills in `{}` for every DECLARED prop missing from
   that map, so Svelte already emitted a prototype accessor and an inert observed
   attribute for `plugins`, `onpluginerror`, and `onviewererror`. The explicit entry was
   still added — it pins `type: 'String'` / no reflection and puts `plugins` in the
   custom-element API report annotated `attributeSupported: false` — but it fixed no bug.
   A test proving the whole path (applier → accessor → inner viewer → SDK activation)
   passes with and without it.
2. **happy-dom implements no custom-element upgrade whatsoever, but jsdom does.**
   In happy-dom `CustomElementRegistry.upgrade` is a documented no-op and `define` does not
   walk the document, so an element created before `define` is never upgraded on insertion;
   anything in 06/07 that assumes happy-dom upgrades will silently test nothing.
   `framework/applier.preUpgrade.test.ts` works around that by transplanting the
   own-property state the applier left onto a registered instance and letting the REAL
   element's `connectedCallback` port it. **jsdom implements the real upgrade algorithm and
   is already a core devDependency**, so the whole path can also be driven with nothing
   simulated: `framework/applier.upgrade.test.ts` does exactly that under
   `@vitest-environment jsdom` (per-file environment overrides work in this suite; see also
   `framework/ssr.test.ts`, which uses `node`). jsdom needs three shims the viewer reads
   while mounting — `matchMedia`, `ResizeObserver`, `IntersectionObserver` — plus the shared
   harness's `installInertAnimations()`. Prefer jsdom whenever a test's subject is upgrade
   ordering.
3. **A real applier hazard Svelte's porting loop creates.** `connectedCallback` ports a
   pre-upgrade own property only when its value is not `undefined` — and deletes it only
   in that same branch. Assigning `undefined` before upgrade therefore leaves an own
   property shadowing the prototype accessor forever, silently swallowing every later
   assignment. The applier deletes instead; do not "simplify" that.

Vite could not resolve the substrate's `import('../triiiceratops-element.js')` in dev or
under vitest (the artifact is a later build step's output), so `packages/core/vite.config.ts`
resolves that one specifier to an inert stub. The real artifact is asserted after
`build:element` by `packages/core/scripts/check-element-artifact.mjs`, and the
`@ts-expect-error` on the import is recorded in `lint-allowlist.md` entry 5.

The Svelte-at-type-time leak from `types/plugin.d.ts` (note 1 above) is untouched and
still open; the substrate introduced no new Svelte dependency of its own.

#### Ticket 05 verification gate

Independently re-verified on `react-and-vue-adapters`: core `check`, the full core suite,
core `lint`, `format:check`, plugin-SDK `check` and suite, `build:lib`, `build:element`
(including `check:element-artifact`), `build:testing`, and `api:check` all pass.

Beyond re-running the commands, the claims most worth doubting were checked directly:

- **The element under test is the real one.** `test/utils/realViewerElement.ts` takes
  `RealViewerElementCtor` from the compiled component's `.element`, which is the exact
  constructor `lib/element.ts` hands the browser runtime. No hand-rolled double is
  registered anywhere in the substrate's suite.
- **Mutation-tested, so the suite is not vacuous.** Five deliberate defects were planted
  and every one was caught: assigning `undefined` instead of deleting a pre-upgrade own
  property, weakening `shallowEqual` to `Object.is`, dropping `runtime.dispose()` on
  rebind, skipping `assertViewerElementCompatible`, and skipping `plugins` in the applier's
  write loop.
- **SSR safety was checked against the BUILT artifact, not just the source.** `node` with
  no browser globals imports `dist/framework/index.js`, evaluates it, reaches for nothing,
  and `ensureViewerElementRegistered()` then rejects with
  `ELEMENT_REGISTRATION_UNAVAILABLE` and stays memoized.
- **Timers.** The registration path has none — no timeout, deadline, retry, or
  `customElements.whenDefined`. The one `setTimeout` in the substrate is in
  `handle.ts:armUnboundWarning`, deferring the dev-only never-bound warning by a macrotask
  so a viewer mounting later can cancel it. It is not a readiness signal and nothing waits
  on it.

Two gaps were found and closed here (commit follows the implementation commit):

1. The pre-upgrade acceptance criterion was covered only by a hand-reproduced upgrade.
   `framework/applier.upgrade.test.ts` now drives the genuine platform upgrade in jsdom —
   see note 2 above — and confirms `manifestJson`, `plugins`, and `searchProvider` assigned
   before `define()` reach the live viewer as properties with no attribute stringified.
2. Edge-triggering "after the element's reflected attribute has diverged" was proven with
   `searchProvider`, which does not reflect. The same file now proves it with `canvasId`:
   after internal navigation moves `canvas-id` to a different value, re-applying the
   unchanged props writes no attribute and does not undo the user's navigation.

The numbering changed when this plan was revised; ticket numbers do not correspond to those in
earlier drafts (for example, the React wrapper moved from 04 to 06).
