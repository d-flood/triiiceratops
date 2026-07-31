# Tracker for framework-wrappers

## Purpose

This document tracks the work required to publish idiomatic React and Vue framework
wrappers over the Triiiceratops custom element and its shared viewer state contract, so
that each framework's consumers get access that feels native to their framework without
installing Svelte at runtime or at type-check time.

## Current Status

Overall status: `In Progress`

Current ticket: None — 05 has landed; 06 and 07 are both unblocked and can proceed in
parallel.

Last updated: 2026-07-31

## Ledger

| Number | Filename                                        | Status                                 | Depends On     |
| ------ | ----------------------------------------------- | -------------------------------------- | -------------- |
| 01     | `01-generalize-selector-runtime.md`             | Completed                              | None           |
| 02     | `02-custom-element-state-bridge.md`             | Needs Human Validation or Intervention | None           |
| 03     | `03-remove-svelte-types-from-public-surface.md` | Completed                              | None           |
| 04     | `04-identity-keyed-plugin-activation.md`        | Completed                              | None           |
| 05     | `05-framework-wrapper-substrate.md`             | Completed                              | 01, 02, 03     |
| 06     | `06-react-framework-wrapper.md`                 | Not Started                            | 05             |
| 07     | `07-vue-framework-wrapper.md`                   | Not Started                            | 05             |
| 08     | `08-consumer-testing-helper.md`                 | Not Started                            | 06, 07         |
| 09     | `09-packed-framework-consumers.md`              | Not Started                            | 04, 06, 07, 08 |
| 10     | `10-public-api-release.md`                      | Not Started                            | 09             |
| 11     | `11-framework-wrapper-docs.md`                  | Not Started                            | 06, 07, 08     |

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
