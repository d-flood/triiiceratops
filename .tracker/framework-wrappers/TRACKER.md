# Tracker for framework-wrappers

## Purpose

This document tracks the work required to publish idiomatic React and Vue framework
wrappers over the Triiiceratops custom element and its shared viewer state contract, so
that each framework's consumers get access that feels native to their framework without
installing Svelte at runtime or at type-check time.

## Current Status

Overall status: `In Progress`

Current ticket: None. 12 is resolved and `Completed` — see "Resolution of ticket 12's `.`
entry finding" below. 06 is `Completed`; 07 is unblocked, subject to the re-export
constraint recorded in the ticket 12 verification gate.

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
| 07     | `07-vue-framework-wrapper.md`                   | Not Started                            | 05, 12         |
| 08     | `08-consumer-testing-helper.md`                 | Not Started                            | 06, 07         |
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
