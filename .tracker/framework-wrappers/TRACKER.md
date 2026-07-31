# Tracker for framework-wrappers

## Purpose

This document tracks the work required to publish idiomatic React and Vue framework
wrappers over the Triiiceratops custom element and its shared viewer state contract, so
that each framework's consumers get access that feels native to their framework without
installing Svelte at runtime or at type-check time.

## Current Status

Overall status: `In Progress`

Current ticket: None — the first wave (01–04) has landed and been integration-verified; 05 is
the next unblocked ticket.

Last updated: 2026-07-31

## Ledger

| Number | Filename                                        | Status                                 | Depends On     |
| ------ | ----------------------------------------------- | -------------------------------------- | -------------- |
| 01     | `01-generalize-selector-runtime.md`             | Completed                              | None           |
| 02     | `02-custom-element-state-bridge.md`             | Needs Human Validation or Intervention | None           |
| 03     | `03-remove-svelte-types-from-public-surface.md` | Completed                              | None           |
| 04     | `04-identity-keyed-plugin-activation.md`        | Completed                              | None           |
| 05     | `05-framework-wrapper-substrate.md`             | Not Started                            | 01, 02, 03     |
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

The numbering changed when this plan was revised; ticket numbers do not correspond to those in
earlier drafts (for example, the React wrapper moved from 04 to 06).
