# Tracker for framework-wrappers

## Purpose

This document tracks the work required to publish idiomatic React and Vue framework
wrappers over the Triiiceratops custom element and its shared viewer state contract, so
that each framework's consumers get access that feels native to their framework without
installing Svelte at runtime or at type-check time.

## Current Status

Overall status: `Completed`

All twelve tickets are implemented and all twelve are `Completed`. EPIC-1 is **fixed** and the
two gaps the final epic gate left open are **closed**; all three were re-verified at the
close-out gate below by measurement against the packed artifact, independently of the agents
that wrote them.

The last remaining blocker — **ticket 02**, environment-blocked since the beginning — was
cleared on 2026-08-03. The owner installed the webkit system libraries, and both gates were
then measured green (see "Webkit unblocked" below):

- `playwright test tests/wc-parity.spec.ts` — **3 passed** on chromium, firefox, AND webkit.
- `pnpm test:packed` — **exit 0**, `FAIL=0`, "All packed-consumer checks passed." The four
  runs that used to fail (`csp-svelte` and `csp-wc-iife`, each under npm and pnpm) now pass.

The epic delivers 73 of SPEC.md's 76 user stories outright, 1 by a recorded superseded
decision, and 2 partially. Nothing is undelivered.

Last updated: 2026-08-03

## Ledger

| Number | Filename                                        | Status    | Depends On     |
| ------ | ----------------------------------------------- | --------- | -------------- |
| 01     | `01-generalize-selector-runtime.md`             | Completed | None           |
| 02     | `02-custom-element-state-bridge.md`             | Completed | None           |
| 03     | `03-remove-svelte-types-from-public-surface.md` | Completed | None           |
| 04     | `04-identity-keyed-plugin-activation.md`        | Completed | None           |
| 05     | `05-framework-wrapper-substrate.md`             | Completed | 01, 02, 03     |
| 12     | `12-drop-legacy-plugindef.md`                   | Completed | None           |
| 06     | `06-react-framework-wrapper.md`                 | Completed | 05, 12         |
| 07     | `07-vue-framework-wrapper.md`                   | Completed | 05, 12         |
| 08     | `08-consumer-testing-helper.md`                 | Completed | 06, 07         |
| 09     | `09-packed-framework-consumers.md`              | Completed | 04, 06, 07, 08 |
| 10     | `10-public-api-release.md`                      | Completed | 09, 12         |
| 11     | `11-framework-wrapper-docs.md`                  | Completed | 06, 07, 08     |

Tickets 01, 05, 06, and 11 were `Needs Human Validation or Intervention` for one shared
reason — EPIC-1, the dead development warnings — and each was moved to `Completed` only
after ITS OWN criterion was re-measured against the published artifact, not as a batch. What
was measured, at the close-out gate below:

- **01** — "a debug-mode warning fires once when a `state`-cadence projection reads through
  `osd`, and does not fire for `frame` cadence — including when debug mode is switched on
  after the projection was first read, and in the PUBLISHED package". All four clauses
  measured against the installed tarball: silent with `debug` off; exactly one warning after
  the flag is switched on later; still exactly one across 25 further recomputes; zero at
  `frame` cadence.
- **05** — "all three debug-mode warnings fire once with `config: { debug: true }` and not at
  all without it". All three measured against the installed tarball: the unmemoized
  property-tier prop (naming the prop), the unbound handle, and the second `ViewerState`.
- **06** — "a `state`-cadence projection reading `osd` triggers the debug-mode warning under
  `config: { debug: true }`, in the PUBLISHED package". Measured twice: directly against the
  tarball, and through the `framework-react` packed fixture's `debug.html` route in a real
  browser.
- **11** — the `config: { debug: true }` claims in `docs/react.md` and `docs/vue.md` are now
  true as written, and both guides were corrected to name `ViewerConfig.debug` rather than
  "development" mode; both now also state the page-level, most-recent-opinion-wins rule and
  tell the reader to pass `config: { debug: false }` to turn the warnings off, which matches
  what was measured. `docs:examples:check` (90 examples, in sync) and `docs:build` exit 0,
  and the `docs-examples` packed fixture passes under npm and pnpm. Its Run block's
  `pnpm test:packed` exits `1` only for the two webkit-blocked CSP fixtures, which have
  nothing to do with this ticket.

Ticket 02 was environment-blocked at that gate and was cleared on 2026-08-03; see "Webkit
unblocked (2026-08-03)".

Ticket 12 was added mid-epic, after the wave-1 gate proved that the epic's "no Svelte at
type-check time" promise is unreachable while `ViewerState` references `PluginDef` and the
`Component<any>`-annotated chrome fields. The owner's decision was to drop the Svelte-only
`PluginDef` path for 1.0 rather than introduce a structural stand-in type. This supersedes
ticket 03's "Do not change `PluginDef`, `PluginPanel`, `PluginFlyout`, or `PluginMenuButton`"
constraint and the SPEC's statement that the leak is "resolved by scope"; see the
**Superseded decisions** section of `SPEC.md`.

## Webkit unblocked (2026-08-03) — ticket 02 closed

The owner installed the webkit system libraries on this machine. Both of ticket 02's blocked
gates were then re-run and both are green. Run on `react-and-vue-adapters` at `9ed9aa6`.

| Command                                   | Exit | Result                                          |
| ----------------------------------------- | ---- | ----------------------------------------------- |
| `pnpm build:all`                          | 0    | required first — see below                      |
| `playwright test tests/wc-parity.spec.ts` | 0    | **3 passed** — chromium, firefox, webkit (4.4s) |
| `pnpm test:packed`                        | 0    | `FAIL=0`, "All packed-consumer checks passed."  |

`csp-svelte [npm]`, `csp-svelte [pnpm]`, `csp-wc-iife [npm]`, and `csp-wc-iife [pnpm]` — the
four failures at the close-out gate, all of them
`browserType.launch: Host system is missing dependencies to run browsers` — now pass. The
phrase "missing dependencies" appears zero times in the run log.

### `dist/` must be rebuilt before either gate — a trap for the next reader

The first `wc-parity.spec.ts` run after the libraries went in failed on **all three** engines,
not just webkit, with a uniform `page.waitForFunction` timeout at line 115. That is NOT a
regression and NOT a webkit problem. The spec drives built artifacts out of `packages/core/dist`,
`dist` is gitignored, and the tree had `main` merged in (`9ed9aa6`, 15:04) after `dist` was last
built (13:55) — so `dist/triiiceratops-element.js` was absent entirely and the IIFE bundle was
stale. The only surface symptom was a `Failed to load source map` warning from Vite, which is
easy to read past.

`pnpm build:all` (exit 0) fixed it and the spec then passed on all three engines. **Run
`pnpm build:all` before `wc-parity.spec.ts` or `test:packed`**, especially after a merge or a
fresh checkout. A uniform all-engine timeout in this spec means stale `dist`, not broken code.

## Close-out gate (2026-08-01)

Run on `react-and-vue-adapters` at `c6fe0e0` — after the EPIC-1 fix (`6c54827`) and the
two-gap fix (`c6fe0e0`) — independently of both implementing agents' accounts. Where this
section and the 2026-07-31 "Final epic gate" below disagree, this one is current; the older
section is kept as the historical record and is annotated in place.

### The gate commands

| Command                    | Exit  | Note                                                                               |
| -------------------------- | ----- | ---------------------------------------------------------------------------------- |
| `pnpm check`               | 0     |                                                                                    |
| `pnpm test`                | 0     | the `applier.upgrade.test.ts` teardown flake recorded below did not reproduce here |
| `pnpm lint`                | 0     |                                                                                    |
| `pnpm format:check`        | 0     |                                                                                    |
| `pnpm build:all`           | 0     |                                                                                    |
| `pnpm api:check`           | 0     |                                                                                    |
| `pnpm docs:examples:check` | 0     | 90 examples, in sync                                                               |
| `pnpm docs:build`          | 0     | **needs `.venv/bin` on `PATH`** — see below                                        |
| `pnpm test:coverage`       | 0     |                                                                                    |
| `pnpm coverage:check`      | 0     | floor OK for 7 packages                                                            |
| `pnpm test:packed`         | **1** | run to completion: 25 fixtures × 2 package managers = 50 runs, **46 PASS, 4 FAIL** |

`pnpm docs:build` fails with `ENOENT: spawnSync zensical` on a shell that has not activated
the Python environment. It is not a repository defect and not a regression: `uv sync` then
`PATH=.venv/bin:$PATH pnpm docs:build` exits 0. Worth stating plainly because the raw command
looks like a broken gate.

The four `test:packed` failures are `csp-svelte [npm]`, `csp-svelte [pnpm]`,
`csp-wc-iife [npm]`, `csp-wc-iife [pnpm]`. Each reaches its third engine — the chromium and
firefox legs run first and pass — and fails with
`browserType.launch: Host system is missing dependencies to run browsers`. Nothing in this
epic touches those fixtures. `framework-react` and `framework-vue` PASS under npm AND pnpm,
with the new `check` (consumer `tsc`) step visible as its own driver step in all four runs.

### The three closing fixes, verified independently

Not by reading the code and not by re-running the fixtures the fixing agents wrote. Every
measurement below drives the **installed packed tarball** — `npm pack` from the final `dist`,
installed with `file:` into a copy of each fixture — through purpose-written probes. Each
probed module was first confirmed byte-identical (`sha256`) between `packages/core/dist` and
the installed tarball.

**1. All four wrapper development warnings are reachable with `config: { debug: true }` and
silent without it.** Measured on the tarball, with the flag set ONLY the way a consumer sets
it (a `config` value written through the real property-tier applier — never by calling
`configureLogging`):

| Warning                                  | `debug` absent | `debug: false` | `debug: true`                       |
| ---------------------------------------- | -------------- | -------------- | ----------------------------------- |
| unmemoized property-tier prop            | silent         | silent         | 1 warning, names `themeConfig`      |
| handle created and never bound           | —              | silent         | 1 warning                           |
| `state`-cadence projection reading `osd` | —              | silent         | 1 warning, names `cadence: 'frame'` |
| second `ViewerState` published           | —              | silent         | 1 warning                           |

The four edge cases the owner named were each measured, not assumed: a `config` supplied as a
JSON string turns the warnings on; an unparseable string states no opinion; a `config` with no
`debug` key states no opinion (so a second viewer cannot silence the first); and flipping the
same live viewer back to `{ debug: false }` silences them again. Ticket 01's remaining clauses
hold too: exactly one warning when debug is switched on AFTER the projection was created and
first read, still exactly one across 25 further recomputes, and zero at `frame` cadence.

The probe has teeth. Replacing `bridgeViewerDebugFlag(value)` with `void value` in the
installed `dist/framework/applier.js` turns 12 passing assertions into 6; restoring the file
returns all 12. The third logger instance the EPIC-1 agent found was checked separately: the
`osd` warning also fires through the selector runtime that `dist/testing/index.js` builds
inside its own bundle, reached the way a consumer reaches it (the shared runtime registry).

**2. Vue throws `TriiiceratopsHandleConflictError` on a double-bound template ref.** One
`shallowRef` on two `<TriiiceratopsViewer>`s, mounted from the tarball's `dist/vue.js` against
the fixture's own Vue: exactly one error reaches `app.config.errorHandler`, it is
`instanceof TriiiceratopsHandleConflictError`, its `code` is `VIEWER_HANDLE_CONFLICT`, and its
message names both `probe-a` and `probe-b`. Two control cases stay silent: two separate refs,
and a ref freed by unmount then reused by a second viewer.

One caveat worth recording: the ownership claim is discovered through `getCurrentInstance()`,
so it silently does nothing if the application and the wrapper resolve DIFFERENT copies of
`vue`. Observed accidentally while writing the probe (Vue itself warns "Missing ref owner
context"). A duplicated Vue is already broken for many other reasons, but the failure mode
here is silence, not an error.

**3. The packed fixtures' type check actually bites.** `npm run check` in each installed
fixture exits 0 clean, with no Svelte package anywhere in either `node_modules`. Four Svelte
type leaks were then planted, one per subpath the promise names, and each was caught:

| Plant                                                                          | Fixture           | Exit | Reverted |
| ------------------------------------------------------------------------------ | ----------------- | ---- | -------- |
| `export … from './components/TriiiceratopsViewer.svelte'` in `dist/react.d.ts` | `framework-react` | 2    | 0        |
| the same in `dist/vue.d.ts`                                                    | `framework-vue`   | 2    | 0        |
| `export type { Component } from 'svelte'` in `dist/state/selectors/index.d.ts` | `framework-react` | 2    | 0        |
| the same in `dist/testing/index.d.ts`                                          | `framework-vue`   | 2    | 0        |

Each failed with `TS2307: Cannot find module 'svelte'`, and each returned to exit 0 when
reverted. SPEC's "at least one type-test consumer compiles with `skipLibCheck: false` and no
Svelte installed, so a Svelte type leak fails the build" is now automated in the packed
matrix under both package managers.

### User-story audit against SPEC.md (76 stories), re-scored

**73 delivered, 1 deliberately superseded, 2 partial, 0 not delivered.** Changes from the
2026-07-31 scoring, each backed by a measurement above:

- **36** — _partial → delivered_. Vue now raises the same error React does, naming both
  elements.
- **45** — _not delivered → delivered_. The warning fires in the published package.
- **62** — _partial → delivered_. Documented in `docs/vue.md` and the re-availability warning
  fires in the published package.
- **35** — _not delivered → partial_, for the residual reason only. The warning now fires in
  the published package, so EPIC-1 no longer blocks it; what remains is that Vue has no
  handle-CREATION API to arm. A Vue consumer's handle is an ordinary template ref, and an
  unused ref is indistinguishable from any other unused ref, so there is nothing for the
  wrapper to warn about. Delivered for React, inapplicable to Vue, and stated in the guides.

Still not fully delivered:

- **8** (published declarations resolve with no Svelte installed) — _deliberately superseded_.
  Unchanged: met for `./react`, `./vue`, `./selectors`, `./testing`, and `./image-export`; the
  `.` entry keeps its single documented residual by the recorded decision.
- **35** — _partial_, React-only by nature. See above.
- **67** (testing helper importable with no React, Vue, or Svelte, in whatever runner you
  already use) — _partial_, unchanged. Re-measured: importing the built
  `dist/testing/index.js` in bare Node still throws `ReferenceError: self is not defined`,
  from the `manifesto.js` fetch polyfill. Works under jsdom/happy-dom, i.e. in every runner a
  React or Vue consumer actually has. Pre-existing and documented in both guides.

### What still needs the owner

1. ~~**Install the webkit system libraries and re-run.**~~ **DONE 2026-08-03.** The owner
   installed them; `wc-parity.spec.ts` passes on all three engines and `pnpm test:packed` exits
   0 with no failures. Ticket 02 is `Completed`. See "Webkit unblocked (2026-08-03)". Note for
   anyone repeating this: `sudo pnpm …` fails with `sudo: pnpm: command not found` when pnpm
   comes from nvm, and `playwright` is not at the workspace root — it lives in
   `packages/core`. What worked:
   `cd packages/core && sudo env "PATH=$PATH" pnpm exec playwright install-deps webkit`.
2. **Run `pnpm release:smoke -- --manifest …` once against a test registry.** Unchanged from
   the previous gate: every probe body was validated offline against a `file:`-installed
   tarball, but the registry-fetch plumbing itself has never been exercised. Needs a registry
   the owner controls.
3. ~~**Fix the `applier.upgrade.test.ts` teardown flake.**~~ **DONE — the owner fixed it in
   `2bf5cc2`**, 42 minutes after the close-out gate below was written, which is why that gate
   still lists it as open. The file appended two `<triiiceratops-viewer>` elements to
   `document.body` and never removed them, so their Svelte components were still mounted with
   live effects when the file finished and teardown ran against a jsdom window vitest had
   already torn down — surfacing as the unhandled
   `TypeError: dom.removeEventListener is not a function` that arrived after the tests passed
   and flipped `pnpm test` to exit 1. Every other real-element suite already had the
   `afterEach`; this file was the only one without it.
4. ~~**Decide whether `.` should ever be Svelte-free.**~~ **DECIDED AND DONE 2026-08-03 — yes.**
   The owner's call was to split rather than accept the residual. The Svelte component and the
   constructible rune-backed state classes moved to a new `triiiceratops/svelte` subpath, which
   is a SUPERSET of `.` (it re-exports the whole neutral surface), so the Svelte migration is a
   one-line specifier change. `.` is now framework-neutral on BOTH axes — measured on the built
   output, its runtime graph is 11 modules and its declaration graph 23 `.d.ts`, with zero
   `svelte*` specifiers in either. `SVELTE_CONSUMER_SUBPATHS` moved from `['.']` to
   `['./svelte']`, so `check:dts-svelte-types` now holds `.` to the strict rule and a
   regression fails the build. `ViewerState` remains a root TYPE export (its declaration was
   always Svelte-free); only the constructible class moved.

    This also closed an unrecorded transitive hole nobody had noticed: `plugin-sdk`'s
    `dist/react.d.ts` and `dist/vue.d.ts` both `import type { ViewerState } from 'triiiceratops'`
    — the ROOT entry — so a React or Vue app using `@triiiceratops/plugin-sdk` under
    `skipLibCheck: false` inherited the Svelte type requirement even though
    `triiiceratops/react` itself was clean. The framework fixtures could not catch it: their
    `assertNoSvelteAndNoSdk` forbids any `@triiiceratops/*` package, so "framework wrapper PLUS
    plugin SDK" was never a tested combination. It is worth adding one.

    Story 8 in the user-story audit moves from _deliberately superseded_ to _delivered_.

5. **Watch the `packed-consumers` CI job's duration.** Still unmeasured against its 60-minute
   timeout. The full local matrix took roughly 45 minutes on a 20-core machine, and CI runs it
   twice (Node 22 and 24) on smaller runners — and each of `framework-react` and
   `framework-vue` now runs an extra consumer `tsc` and builds two more routes.
6. **Consider a build-time guard for shared module identity.** Three separate defects in this
   epic were the same bug: a module holding module-level MUTABLE state got inlined into a
   second published entry, producing two instances (two `WeakMap`s in ticket 08; two — in fact
   three — loggers in EPIC-1). The standing rule is now "any module in `src/lib` holding
   module-level mutable state that a different published entry reads or writes must be listed
   in `SHARED_MODULE_IDENTITY` in `vite.config.testing.ts`", but nothing enforces it. A guard
   enumerating such modules and asserting they are never inlined into a second entry would
   catch the next one automatically. `vue/templateRefOwnership.ts` is the newest module of
   that class (two ownership registries); it is safe today because only `dist/vue.js` reaches
   it, as a real module.
7. **Confirm the release bump for the two closing changesets.** `.changeset/
bridge-viewer-debug-flag.md` and `.changeset/vue-template-ref-ownership.md` are `patch` on
   `triiiceratops` and `.changeset/packed-framework-typecheck.md` covers the fixture work; the
   repo is in `pre`/rc mode, so the release manager may want them treated differently.

## Final epic gate (all twelve tickets, composed)

**Superseded in part by the close-out gate above (2026-08-01).** Kept as the historical
record of what was true on 2026-07-31, with corrections annotated in place.

Run on `react-and-vue-adapters` at `90c07a8`, 2026-07-31, independently of every implementing
agent's account. The working tree was clean before and after.

### The ten gate commands

| Command                    | Exit  | Note                                                               |
| -------------------------- | ----- | ------------------------------------------------------------------ |
| `pnpm check`               | 0     |                                                                    |
| `pnpm test`                | 0     |                                                                    |
| `pnpm lint`                | 0     |                                                                    |
| `pnpm format:check`        | 0     |                                                                    |
| `pnpm build:all`           | 0     |                                                                    |
| `pnpm api:check`           | 0     | `api-report.ts --no-build` afterwards produced no drift            |
| `pnpm docs:examples:check` | 0     | 90 examples, in sync                                               |
| `pnpm docs:build`          | 0     | local zensical still prints "Strict mode is currently unsupported" |
| `pnpm coverage:check`      | 0     | floor OK for 7 packages                                            |
| `pnpm test:packed`         | **1** | 25 fixtures × 2 package managers = 50 runs; **46 PASS, 4 FAIL**    |

`pnpm test:packed` was run to completion, not interrupted. The four failures are
`csp-svelte [npm]`, `csp-svelte [pnpm]`, `csp-wc-iife [npm]`, `csp-wc-iife [pnpm]`, each of
which passes on chromium AND firefox in the same run and fails only at its third engine with
`browserType.launch: Host system is missing dependencies to run browsers`
(`libgstreamer-plugins-bad1.0-0`, `libflite1`, `libavif16`, `gstreamer1.0-libav`; installing
them needs root). Nothing in this epic touches those two fixtures. `framework-react` and
`framework-vue` both PASS under npm and pnpm. CI's `packed-consumers` job installs webkit with
`--with-deps`, so `pnpm test:packed` is expected to exit `0` there.

Also re-run outside the ten: `pnpm release:reproducible` (all six tarballs byte-identical
across two clean builds), `pnpm release:pack` (six tarballs + `SHA256SUMS` +
`release-manifest.json`, core first), and `playwright test tests/wc-parity.spec.ts` —
2 passed on chromium + firefox, 1 failed to launch on webkit. Ticket 02's blocker is exactly
what was recorded, unchanged.

### The central promise, measured one final time

A tarball packed from the final `dist` (`triiiceratops-1.0.0-rc.31.tgz`) was installed with
`file:` into a throwaway project whose only dependencies are `react@19.2.7`,
`react-dom@19.2.7`, `vue@3.5.40`, `@types/react`, `@types/react-dom`, `typescript@5.9.3`, and
`jsdom` — 60 top-level `node_modules` entries, **zero** Svelte packages anywhere in the tree.
Under `strict`, `moduleResolution: bundler`, `types: []`, **`skipLibCheck: false`**:

| Consumer                                           | `tsc` exit | Errors |
| -------------------------------------------------- | ---------- | ------ |
| `triiiceratops/react` (every named export, `.ts`)  | 0          | **0**  |
| `triiiceratops/react` (JSX consumer, `.tsx`)       | 0          | **0**  |
| `triiiceratops/vue` (every named export, `.ts`)    | 0          | **0**  |
| `triiiceratops/selectors`                          | 0          | **0**  |
| `triiiceratops/testing`                            | 0          | **0**  |
| all five together                                  | 0          | **0**  |
| `import type { ViewerState } from 'triiiceratops'` | 2          | **1**  |

The last row is the probe's teeth and the known, deliberately-scoped `.`-entry residual
(`dist/components/TriiiceratopsViewer.svelte.d.ts(38,43) TS2307: Cannot find module 'svelte'`).

Runtime, in the same project. Bare Node, `window`/`document`/`customElements` all `undefined`
before and after every import:

| Subpath                   | Named exports | Default export | Touched a DOM global | `globalThis.Triiiceratops` |
| ------------------------- | ------------- | -------------- | -------------------- | -------------------------- |
| `triiiceratops/react`     | 12            | no             | no                   | never set                  |
| `triiiceratops/vue`       | 12            | no             | no                   | never set                  |
| `triiiceratops/selectors` | 1             | no             | no                   | never set                  |
| `triiiceratops/testing`   | 11            | no             | no                   | never set                  |

`triiiceratops/testing` still needs `globalThis.self` in **bare** Node
(`ReferenceError: self is not defined`, from the `manifesto.js` fetch polyfill) — pre-existing,
recorded by ticket 08, documented in both guides, and irrelevant under jsdom/happy-dom.

And they run. Under jsdom, against the packed tarball, driving one real command through a real
`ViewerState` from `createTestViewerHandle()`:

- React `useViewerSelector` re-rendered `none` → `canvas-42`;
- Vue `useViewerSelector` (with the documented `shallowRef`) re-rendered `canvas-42` → `canvas-99`;
- a `triiiceratops/selectors` projection read `canvas-99` → `canvas-7`;
- `customElements.get('triiiceratops-viewer')` stayed `undefined` throughout.

That is ticket 08's shared-registry fix holding in the artifact, verified from outside.

### EPIC-1 — the four development-only warnings never fire in the published package

> **FIXED in `6c54827`, and re-verified at the close-out gate above.** This subsection is the
> diagnosis, kept for the record. Two corrections to it: there were **three** logger
> instances, not two — `dist/testing/index.js` inlined a third, and because
> `configureLogging` was unreachable from that entry the minifier proved `debugEnabled` a
> constant `false` and DELETED the `osdViewer` probe from that artifact outright. And the
> chosen fix was none of the three options listed under "Not fixed here": the owner chose to
> **bridge the flag at registration**, so `config: { debug: true }` configures the
> wrapper-side logger when the property-tier applier writes `config`. No public API changed.
> See "The EPIC-1 fix" below.

**Measured, not inferred.** `dist/triiiceratops-element.js` contains **0** static import
statements and its own inlined `[triiiceratops]` log prefix: it is a fully self-contained
bundle. `configureLogging` has exactly one caller in the whole repository —
`TriiiceratopsViewer.svelte:444`, `configureLogging({ debug: config?.debug ?? false })` — and
that file ships _inside_ that bundle. The framework substrate, the React and Vue wrappers, and
the selector runtime all warn through `dist/logging/logger.js`, a **separate** module instance
whose `debugEnabled` starts `false` and is never written by anything a framework consumer can
reach. Importing `configureLogging` from the `.` entry would reach it, but that entry pulls the
compiled Svelte component into the graph, which is precisely what these subpaths exist to
avoid — and `configureLogging` is not exported from `./react`, `./vue`, `./selectors`, or
`./testing`.

Confirmed by running the built modules directly: with the substrate's logger left alone, an
applier driven past its threshold produced **0** warnings; after calling `configureLogging`
on that module instance, **1**. The four affected warnings:

| Warning                                                       | Site                             | SPEC story        |
| ------------------------------------------------------------- | -------------------------------- | ----------------- |
| property-tier prop re-assigned an implausible number of times | `framework/applier.ts:97`        | (Impl. decisions) |
| handle created and never passed to a viewer                   | `framework/handle.ts:107`        | 35                |
| `state`-cadence projection reading through `osd`              | `state/selectors/runtime.ts:245` | 45                |
| a second `ViewerState` published (`<KeepAlive>` state loss)   | `framework/binding.ts:151`       | 62                |

**Why every wave missed it.** Each warning's test calls `configureLogging` on the _source_
module, which under vitest is the same instance the code under test uses, so the tests are
correct about the source and silent about the artifact. The packed fixtures never set
`debug: true` and never assert a warning. It is the same class of defect the 08/11 gate found
in the testing entry (two `WeakMap`s), in a place nobody thought to look twice.

The `state`-cadence probe is additionally gated on `isDebugEnabled()` before it installs its
`osdViewer` accessor, so in the published package it costs nothing — and does nothing.
`armUnboundWarning`'s `setTimeout` still runs on every `useViewerHandle()` mount and can never
warn.

**Not fixed here.** The fix is a design choice — export `configureLogging` from the framework
subpaths, have registration bridge the flag across the boundary, or gate on `NODE_ENV` instead
of `ViewerConfig.debug` — and each has a different public-API and docs consequence. Nothing was
changed in product code or in the guides so the owner is not pre-empted.

### Other cross-wave findings

1. **SPEC's "at least one type-test consumer compiles with `skipLibCheck: false` and no Svelte
   installed, so a Svelte type leak fails the build" is not automated anywhere.**
   **CLOSED in `c6fe0e0`:** `framework-react` and `framework-vue` each gained a
   `tsconfig.json` (`skipLibCheck: false`, `strict`, `types: []`) and a `check` script, run by
   a new `checkScript` step in the packed driver before the build, under both package
   managers. Re-verified at the close-out gate by planting a Svelte type leak into four
   installed `.d.ts` files. The rest of this finding is the pre-fix state:
   `strict-osd-types` uses `skipLibCheck: false` but installs `svelte` and imports the `.`
   entry; `docs-examples` installs `svelte` and uses `skipLibCheck: true`; `framework-react`
   and `framework-vue` are plain JavaScript with no `tsconfig.json` and no `tsc` step. Every
   measurement of the promise so far — including the table above — has been a manual,
   throwaway-project run by a gate agent. The automated substitutes that DO exist are
   `check:dts-svelte-types`'s strict per-entry pass (specifier-level, over the whole
   declaration graph) and `check:framework-entries` (runtime graph); both were independently
   mutation-tested here and both bite. They are narrower than a consumer `tsc` run but, for
   the Svelte question specifically, arguably stricter.
2. **Story 36 is React-only, and that is fine but worth stating.** ~~The Vue wrapper never
   claims a `ViewerHandleSlot`, so `TriiiceratopsHandleConflictError` is exported from
   `triiiceratops/vue` and can never be thrown by it.~~ **NO LONGER TRUE, closed in
   `c6fe0e0`:** the Vue wrapper now resolves the template ref Vue recorded on its own vnode to
   the box the value is written into and gives that box the substrate's real handle slot to
   claim, so one ref on two viewers raises the same `TriiiceratopsHandleConflictError`, naming
   both elements. `docs/vue.md` was updated. Story 36 is delivered outright.
3. **Stale claim corrected below**: the 06/07 gate recorded "No `.tsx` and no `.vue` file
   exists in the repository". 32 tracked `.tsx`/`.vue` files exist now (generated
   docs-example output and the Vue fixture's SFCs). Ticket 09 already flagged this; the
   original sentence is annotated in place.
4. **Nothing in `git diff 3a5420a..HEAD` is unrequested.** The changes that look off-topic —
   `Toolbar.svelte`, five icon components, `types/config/panels.ts`, `plugin/surface.ts`,
   three pre-existing changesets — are all comment or type edits from ticket 12's `PluginDef`
   removal; `public/e2e/wc-*.html` is ticket 02's. No `TODO`/`FIXME`/`HACK` was added and no
   test is skipped or `todo`.
5. **Guards re-verified by mutation, independently of the tickets that added them.** Planting
   `export { default as __Planted } from './components/TriiiceratopsViewer.svelte'` in
   `dist/react.d.ts` fails `check:dts-svelte-types` (exit 1); planting `import 'svelte'` in
   `dist/framework/handle.js` fails `check:framework-entries` naming both subpaths (exit 1);
   repointing the testing entry's `../framework/runtimeRegistry.js` import at a real private
   copy fails `check:testing-entry` with the intended message (exit 1). All three were
   reverted and re-run clean.
6. **`framework-react/src/{fixtures,events}.js` are still byte-identical** to their Vue
   counterparts (verified with `diff`). The hand-maintained duplication ticket 09 warned about
   has not drifted yet.

### User-story audit against SPEC.md (76 stories)

> **Superseded by "User-story audit against SPEC.md (76 stories), re-scored" in the close-out
> gate above.** Stories 35, 36, 45, and 62 were all re-scored after the two closing fixes; the
> current tally is 73 delivered, 1 superseded, 2 partial, 0 not delivered. The scoring below
> is what was true on 2026-07-31.

**70 delivered, 1 deliberately superseded, 3 partial, 2 not delivered.** Everything not fully
delivered:

- **8** (published declarations resolve with no Svelte installed) — _deliberately superseded_.
  Met for `./react`, `./vue`, `./selectors`, `./testing`, and `./image-export` (0 errors each,
  measured above). The `.` entry keeps its single documented residual by the decision recorded
  in SPEC "Superseded decisions" and "Resolution of ticket 12's `.` entry finding". A framework
  consumer never imports `.`, so the story's own persona is satisfied.
- **35** (development warning for a handle never passed to a viewer) — _not delivered_. EPIC-1;
  additionally React-only, since a Vue template ref has no arming point.
- **36** (prompt error when one handle goes to two viewers) — _partial_. React throws
  `TriiiceratopsHandleConflictError` naming both elements. Vue cannot: the wrapper claims no
  slot. Documented.
- **45** (development warning when a batched-cadence projection reads through `osd`) —
  _not delivered_. EPIC-1.
- **62** (`<KeepAlive>` state loss documented **and** warned about) — _partial_. Documented in
  `docs/vue.md`; the warning is EPIC-1.
- **67** (testing helper importable with no React, Vue, or Svelte, in whatever runner you
  already use) — _partial_. Importable and functional with none of the three installed
  (measured), but the built entry needs a `self` global, so a bare-Node runner fails. Works in
  vitest/jest under jsdom or happy-dom. Pre-existing, documented in both guides.

The remaining 70 were each checked against something observed — the packed browser journey, a
measurement against the built `dist`, the type-check table above, or the source with a test
that was read rather than trusted.

### What still needs the owner

> **Superseded by "What still needs the owner" in the close-out gate above.** Items 1 and 4
> below are DONE (EPIC-1 was decided and fixed in `6c54827`; the consumer type-check was
> automated in `c6fe0e0`). Items 2, 3, 5, and 6 are still open and are restated there.

1. ~~**Decide EPIC-1.**~~ **DONE — bridged at registration; see "The EPIC-1 fix" below.**
   Either make the wrapper-side warnings reachable (export
   `configureLogging` from `./react` and `./vue`, bridge the flag during registration, or
   switch the gate to `NODE_ENV`) or drop the promise and remove the seven
   "`config: { debug: true }`" claims from `docs/react.md` and `docs/vue.md` and the three
   acceptance criteria in tickets 01, 05, and 06. Whichever way, add one packed-fixture
   assertion so the
   answer is measured rather than asserted. Public-API and docs decision; owned by nobody.
2. **Install the webkit system libraries** (`sudo pnpm exec playwright install-deps`, or
   `libgstreamer-plugins-bad1.0-0 libflite1 libavif16 gstreamer1.0-libav`) and re-run
   `pnpm test:packed` and `playwright test tests/wc-parity.spec.ts` to close ticket 02 and get
   a locally observed `0` from the packed matrix. Needs root.
3. **Run `pnpm release:smoke -- --manifest …` once against a test registry.** Ticket 10
   rewrote it to cover both framework subpaths and validated every probe body offline against
   a `file:`-installed tarball, but the registry-fetch plumbing itself is still unexercised.
   Needs a registry the owner controls.
4. ~~**Decide whether to automate the `skipLibCheck: false` + no-Svelte consumer
   type-check**~~ **DONE in `c6fe0e0`, exactly as sketched here** — a `tsconfig.json` and a
   `check` script inside `framework-react` / `framework-vue`, which already install exactly
   the right dependency set. Adds a `tsc` run to two packed fixtures.
5. **Decide whether `.` should ever be Svelte-free.** Unchanged and still owned by nobody; the
   shape of the fix is recorded in "Ticket 10 outcome" and the exemption is encoded in
   `SVELTE_CONSUMER_SUBPATHS`.
6. **Watch the `packed-consumers` CI job's duration.** Still unmeasured against its 60-minute
   timeout; the full local matrix took roughly 45 minutes on a 20-core machine, and CI runs it
   twice (Node 22 and 24) on smaller runners.

## The EPIC-1 fix (`6c54827`) — what a later reader must know

The owner's decision was to **bridge the flag at registration**: no new public API, no docs
rewrite, and the switch stays where the guides already say it is, `ViewerConfig.debug`. The
root cause turned out to have three independent parts, each of which had to be fixed for the
warnings to reach a real consumer.

1. **The bridge.** `packages/core/src/lib/framework/debugFlag.ts`, called from the
   property-tier applier's `write()` when it writes `config`. It resolves the value the way
   the element does (object, or JSON string) and, if the resolved object carries a `debug`
   key, calls `configureLogging({ debug })` on the wrapper-side logger. The four cases the
   owner named are handled and documented at that module's top: a JSON string is parsed (an
   unparseable one states no opinion); an absent `config` is never written, so the flag keeps
   its default; a `config` with no `debug` key deliberately states NO opinion; a `config` that
   changes after mount re-bridges in both directions, because the applier is edge-triggered;
   two wrappers that disagree resolve most-recent-opinion-wins, the rule `configureLogging`
   already documents.
2. **The selector-runtime probe.** `state/selectors/runtime.ts` decided whether to install the
   `osdViewer` probe inside `compute()` only — at whatever moment a projection happened to be
   read first. Since `read()` is memoized by notification version, a projection first read
   before the flag was bridged never probed again. An `owesOsdProbe()` predicate now forces
   exactly ONE re-evaluation after debug turns on (`probedOsdRead` makes it one-shot). With
   debug off it short-circuits on a boolean: no accessor, no timer, no re-evaluation, so an
   idle viewer still costs nothing (story 44 is unaffected).
3. **A THIRD logger instance nobody had recorded.** `dist/testing/index.js` inlined its own
   copy of `logging/logger.js`. Because `configureLogging` is unreachable from that entry's
   exports, the minifier could prove `debugEnabled` a constant `false` and DELETE the
   `osdViewer` probe from the artifact entirely — the warning was not merely silent there, it
   was physically absent (`grep 'OpenSeadragon instance' dist/testing/index.js`: 0 before, 1
   after). `logging/logger.js` is now kept external in `vite.config.testing.ts` alongside
   `framework/runtimeRegistry.js`, through the same documented `SHARED_MODULE_IDENTITY`
   mechanism.

**One deliberate, documented asymmetry remains between the two loggers.** The element resolves
a config with no `debug` key to `false` (`config?.debug ?? false`); the wrapper-side bridge
treats a missing key as "no opinion" and leaves the flag alone. That is what stops a second
viewer configured `{ locale: 'fr' }` from silencing the diagnostics the first viewer asked
for. The consequence: going from `config: { debug: true }` to `config: {}` (or clearing
`config`) leaves the wrapper warnings ON while the element's own logging goes off. Both guides
now say to pass `config: { debug: false }` to turn them off. If that asymmetry is ever judged
unacceptable, note that `framework/applier.test.ts`'s existing "warns per prop" and "does not
warn below the threshold" tests depend on it.

Also worth remembering: the Vue debug fixture route needs its OSD projection to read a Vue
reactive dependency, because a `computed` is lazy and an idle viewer never re-evaluates it.
React's `useSyncExternalStore` re-reads on every render; Vue does not.

## The two-gap fix (`c6fe0e0`) — what a later reader must know

**Vue's double-bound template ref.** `packages/core/src/lib/vue/templateRefOwnership.ts` reads
the ref Vue itself recorded for the component (`instance.vnode.ref`, captured in `setup` via
`getCurrentInstance()`), resolves it to the BOX the value will be written into, and gives that
box the substrate's real `createViewerHandleSlot()` to `claim()`. So the ownership rule, the
conflict detection, and the error naming both elements are the substrate's — identical to
React's — and only "which box" is Vue-specific. Three ref shapes: a ref object is its own box;
a string ref's box is `instance.refs[name]` on the OWNING component, so the same name in two
different components does not conflict; a callback ref owns nothing. Vue's `v-for` marker
(`f`) is skipped, because collecting into an array is the documented intent. `<KeepAlive>`
needed explicit handling: Vue clears the template ref when it deactivates a component but
never runs `onBeforeUnmount`, so the wrapper releases on `onDeactivated` and re-claims on
`onActivated`, idempotently.

Two properties of this that are easy to lose:

- The key is read from `instance.vnode.ref`, whose atom shape (`{ i, r, k, f }`) is
  Vue-internal and not an exported type. It is restated structurally in that module and only
  `i`, `r`, and `f` are read. It is stable across Vue 3.x and is the one place the Vue wrapper
  depends on something outside Vue's documented surface — re-check it on a Vue 4 upgrade.
- The claim is discovered through `getCurrentInstance()`, so it does nothing at all if the
  application and the wrapper resolve different copies of `vue`. Observed at the close-out
  gate; Vue itself warns "Missing ref owner context", but the ownership check's own failure
  mode is silence.

One asymmetry with React remains, by nature rather than by choice: React's conflict is thrown
from a layout effect and unmounts the subtree through the error boundary, so viewer 1 goes
away with it. Vue's is thrown from `onMounted`, and Vue's error handling leaves the tree
standing — viewer 1 stays bound and usable, and the offending second viewer stays rendered but
unbound. The source suite pins the Vue behaviour; the shared packed assertion deliberately
checks only the error.

**The automated consumer type check.** `framework-react` and `framework-vue` each gained a
`tsconfig.json` (`skipLibCheck: false`, `strict`, `types: []`, `jsx: react-jsx` for React) and
a `check` script, wired in through a new optional `checkScript` step in the packed driver that
runs before the build. Between them the two programs cover `./react`, `./vue`, `./selectors`,
and `./testing`; `.` is never imported. The shared journey additionally asserts the compiler
options themselves and which subpaths are imported, so the guarantee cannot be quietly retired
by editing the tsconfig or deleting an import.

Two traps recorded by the implementing agent and worth keeping:

- `framework-consumer-assert.mjs`'s no-Svelte scan matches ANY `from '…svelte…'` occurrence in
  a fixture file, **including inside comments**. Writing the word in a doc comment inside a
  fixture fails the fixture. It cost one full packed run.
- The `checkScript` seam is generic. `strict-osd-types` and `docs-examples` still overload
  `buildScript` for their `tsc` runs and could move to `checkScript` for clearer logs; nothing
  required it, so they were left alone.

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
  **(That last sentence is STALE as of ticket 09: 32 tracked `.tsx`/`.vue` files exist now —
  the generated `docs-examples` output and the Vue fixture's single-file components. It is
  still true of `packages/`.)**
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
   has **no bare imports at all**. It has exactly ONE relative import,
   `../framework/runtimeRegistry.js`, deliberately kept external — see the 08/11
   verification gate below, which also added a guard for it.
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

### Ticket 11 outcome — what 09 and 10 must know

The primary React and Vue guides are new pages, `docs/react.md` and
`docs/vue.md`, both added to `zensical.toml`'s explicit `nav` (React and Vue sit
above "Use with any framework"). `docs/integration.md` keeps every direct
custom-element example, moved under a new `## Low-level: driving the custom
element directly` section that also documents the `viewerState` state bridge and
the element's `searchProvider` property; its React/Vue tabs now show the wrappers
and link to the guides. `docs/plugins.md`, `docs/configuration.md`,
`docs/index.md`, and `docs/theming.md` were corrected in place.

Facts worth not rediscovering:

1. **`scripts/docs-examples.mjs` now also extracts fenced `vue` blocks.** It
   pulls the `<script setup lang="ts">` body out as a `.ts` file, so the Vue
   guide can be written as idiomatic single-file components AND still be
   type-checked against the packed declarations. Only `lang="ts"` script-setup
   blocks are extracted, so every pre-existing plain `<script setup>` block in
   the docs is untouched — `docs:examples:check` reported no drift after the
   change and before any doc edit. **An extracted body must stand alone as a
   module: no `defineProps`/`defineEmits`/`withDefaults` in a block you want
   checked.** Verified to have teeth by planting `state.noSuchMember` into an
   SFC (tsc exit 2, naming `vue-02.ts`) and reverting.
2. **`test-consumers/fixtures/docs-examples/globals.d.ts` gained
   `declare module '*.vue'`**, for the one example that imports a reader-owned
   `./CanvasLabel.vue`. No new fixture dependency was added — `@testing-library/react`
   was deliberately NOT introduced; the React testing example uses
   `react-dom/client` + `act`, both already installed.
3. **`ViewerConfig` is not exported from the `.` entry** (only from `./react`,
   `./vue`). A low-level TypeScript consumer therefore cannot type `el.config`
   from `triiiceratops`; the docs widen `TriiiceratopsViewerElement` with a local
   structural type instead. If ticket 10 wants that gap closed, it is a public-API
   addition, not a docs fix.
4. **`state.canvases` is typed `any`**, so `state.canvases.map((c) => …)` in an
   example fails `noImplicitAny`. `state.canvases.length` is fine. Cost one
   iteration.
5. **All four development warnings are `logger.warn`, which is silent unless
   `config: { debug: true }`.** The docs say so explicitly for each; do not
   describe them as unconditional dev-mode warnings.
6. **`docs:build` needs the Python `zensical` CLI on `PATH`** (`uv sync`, then
   `.venv/bin`). Locally installed 0.0.11 prints "Strict mode is currently
   unsupported", so `--strict` link checking does NOT run locally even though CI
   pip-installs a newer zensical and relies on it. Every internal link and anchor
   added here was therefore verified by hand against the built HTML.
7. **Docs are prettier- and eslint-ignored** (`docs/`), and the generated fixture
   directory is too, so only `scripts/docs-examples.mjs` and `globals.d.ts` are
   format-gated by this ticket.

Verified: `pnpm docs:examples`, `pnpm docs:examples:check` (90 examples, in
sync), `pnpm docs:build`, `pnpm format:check`, and
`PACKED_ONLY=docs-examples pnpm test:packed` all exit 0 — the packed fixture
type-checks every extracted example against freshly packed tarballs under BOTH
npm and pnpm. `api-reports/` is unchanged, so no changeset is required (the CI
gate keys on that directory).

Not done here, deliberately: ticket 09's full packed matrix. Only the
`docs-examples` fixture was run, per the ticket's own guidance.

#### Tickets 08 and 11 verification gate

Independently re-verified on `react-and-vue-adapters`, all exiting `0`:
`pnpm --filter triiiceratops check` / `test` (848) / `lint` / `build:lib` /
`build:element` / `build:testing`, then workspace `pnpm check`, `pnpm test`,
`pnpm api:check`, `pnpm docs:examples:check` (90, in sync), `pnpm docs:build`,
`pnpm format:check`, and `PACKED_ONLY=docs-examples pnpm test:packed` (npm and
pnpm both PASS, plus every tarball-contents/peers check).

**One real defect was found and fixed** (`fix(core)` commit below). Everything
else held.

1. **The helper's central promise was FALSE in the published package.**
   `framework/runtimeRegistry.js` owns a module-level `WeakMap`;
   `createTestViewerHandle()` writes the handle's selector runtime into it and
   `triiiceratops/react` / `triiiceratops/vue` read it back out. But those are
   SEPARATE build outputs: `dist/react.js` imports `dist/framework/runtimeRegistry.js`
   as a real module, while `vite.config.testing.ts` inlined a private copy into
   `dist/testing/index.js`. Two `WeakMap`s. Against the built `dist`,
   `getSelectorRuntime(handle.state)` returned `undefined`, so
   `useViewerSelector()` against a test handle would have been `undefined`
   forever for every consumer. Every source unit test stayed green, because
   vitest resolves one copy of the source module — the bug is only observable in
   the artifact. Fix: `vite.config.testing.ts` keeps that one module external
   (a `resolveId` plugin plus `makeAbsoluteExternalsRelative: false`, because
   rollup's own relativization of a relative external is derived from the source
   tree, which does not mirror `dist/`). The entry now emits exactly one relative
   import, `../framework/runtimeRegistry.js`, and no bare imports at all.
   `check:testing-entry` gained an assertion that the artifact contains that
   specifier; planting an inlined copy back in makes it exit 1.
   **Proof, not inspection:** `npm pack` was installed into a throwaway project
   with `react`, `react-dom`, and `vue` — a React `<Sidebar>` and a Vue
   `CanvasLabel` both render `undefined`→value from a real command through the
   PACKED package, and a `cadence: 'frame'` zoom readout follows an injected OSD
   stand-in's `animation` handler. Swapping only that one import back to a
   private copy inside `node_modules` makes all three fail; restoring it makes
   all three pass. Ticket 09's packed helper fixture would have hit this.
2. **Everything else about ticket 08 checked out, verified against the tarball.**
   In a second throwaway project whose ONLY dependencies are the tarball,
   `vitest`, and `jsdom` — importing `react`, `react-dom`, `vue`, and `svelte`
   all reject — `createTestViewerHandle()` imports and works;
   `handle.state instanceof ViewerState`; `element.viewerState === handle.state`;
   two commands in one tick produce exactly ONE notification, and none before
   `await flush()`. With `fetch` and `XMLHttpRequest` stubbed to throw, neither
   is called, `customElements.get('triiiceratops-viewer')` stays `undefined`,
   the inert host is never connected, and `osdViewer` stays absent.
3. **Disposal was verified by COUNTING live registrations**, not by reading code:
   `ViewerState.prototype.subscribe` was patched to track subscribe/unsubscribe
   pairs. One handle = exactly 1 live registration; mounting three selector
   components against it still = 1; `dispose()` → 0; two further `dispose()`
   calls → still 0, no throw; 100 handles created and double-disposed leak 0.
4. **Ticket 11's React testing example emitted React errors when run verbatim.**
   Extracted and executed, it logged "The current testing environment is not
   configured to support act(...)" (twice) and then "An update to Root inside a
   test was not wrapped in act(...)" for the bare `root.unmount()`. Fixed in
   `docs/react.md`: the example now sets `IS_REACT_ACT_ENVIRONMENT` with a note
   that most setups do it in a shared setup file, and wraps the unmount in `act`.
   Re-extracted and re-run: clean. The Vue testing example runs verbatim with no
   diagnostics.
5. **The docs' factual claims were spot-checked against source, not trusted.**
   Prop/emit tables match `vue/viewer.ts`'s `viewerProps` and `ViewerEmits` and
   the React prop types; the four error classes exist and are exported from both
   entries; `showCanvasNav`, `showToggle`, `toolbar.side`, `debug` exist on
   `ViewerConfig`; `BuiltInTheme` is exactly `light | dark | teal | dracula`;
   the `ViewerStateSnapshot` interface reproduced in `configuration.md` matches
   `viewer.svelte.ts` field for field; the four hidden lifecycle methods named in
   both guides match `ReadonlyViewerState`'s `Omit`. No doc mentions `PluginDef`,
   `createPanelPlugin`, `createFlyoutPlugin`, or `ViewerState.registerPlugin`
   except as explicitly-removed legacy; no doc calls the `.` entry Svelte-free
   (the claim is correctly scoped to `./react` and `./vue` everywhere it appears);
   `plugins.md`'s "the web component does not expose `viewerState`" is gone and
   replaced by a pointer to the state bridge. A script slugified every heading in
   `docs/` and resolved every internal link and anchor: all resolve.
6. **The guides are genuinely per-framework, not one example rewritten twice.**
   React is built on `useViewerHandle()` + a `handle` prop, `<ViewerProvider>`,
   `useMemo`/hoisting, a forwarded `ref`, and React's loud `Missing
getServerSnapshot` SSR failure. Vue is written as single-file components with
   `useTemplateRef<TriiiceratopsViewerInstance>` and both optional chains,
   `provideViewer`, kebab emits, `shallowRef`, and has two sections React has no
   analogue for (Vue reactive dependencies tracked inside a projection;
   `<KeepAlive>` rebinding and its state loss) plus a scoped-styles note. The
   shared conceptual material (cadence, "what notifies", the boundary section) is
   deliberately parallel. Low-level custom-element guidance survives in full
   under `integration.md`'s new low-level section, reframed rather than deleted.

Left alone deliberately: `framework/handle.js`, `errors.js`, and ~~`logger.js`~~ are
still BUNDLED into the testing entry. ~~Only the registry needs shared module
identity.~~ **CORRECTED 2026-08-01: `logging/logger.js` was NOT safe to bundle and is now
external too — that inlined third copy is EPIC-1 part 3, and the minifier deleted a whole
diagnostic from the artifact because of it. `SHARED_MODULE_IDENTITY` in
`vite.config.testing.ts` now lists `framework/runtimeRegistry.js` AND `logging/logger.js`.**
The consequence of `errors.js` still being bundled is that a test handle mistakenly passed to
a real `<TriiiceratopsViewer>` throws a `TriiiceratopsHandleConflictError` with the
right name and message but not `instanceof` the class `triiiceratops/react`
exports; the code comment that overclaimed this now says so.

### Ticket 09 outcome — what 10 must know

Two packed consumer fixtures, `test-consumers/fixtures/framework-react` and
`framework-vue`, plus one shared journey
(`test-consumers/fixtures/framework-consumer-assert.mjs`, prior art:
`plugin-adapter-assert.mjs`) and one driver-level Node assertion in
`driver/run.mjs`. Both fixtures are in `FIXTURES`, so the matrix is now 25
fixtures × 2 package managers × 2 Node versions. No package source changed, so
`api-reports/` is untouched and no changeset is required.

Each fixture builds THREE routes from one Vite build plus a `prerender.mjs`
step: `index.html` (the whole client contract), `ssr.html` (rendered in plain
Node by `react-dom/server` / `vue/server-renderer` at build time, then
hydrated), and `conflict.html` (a foreign `<triiiceratops-viewer>` registered
first). Both expose the SAME in-page control surface — `window.__tri`,
`window.__ssr`, `window.__conflict` — which is what lets one journey drive both
frameworks and prove they implement the same contract rather than two similar
ones.

**Updated 2026-08-01: each fixture now builds FIVE routes and runs a `check` step before the
build.** `debug.html` (`window.__debug`) was added by the EPIC-1 fix and `double-bind.html`
(`window.__doubleBind`) by the two-gap fix, each with the same shared control surface and each
driven from the same shared journey. The `check` step runs the fixture's own
`tsc -p tsconfig.json` over `typecheck/`.

Facts worth not rediscovering:

1. **The driver now passes `fixtureDir` (and `serveRoot`) into a BROWSER
   fixture's `assert` context.** That is what lets a fixture assert on what the
   package manager actually installed. `assertNoSvelteAndNoSdk` reads
   `package.json`, walks `node_modules` (including pnpm's `.pnpm` virtual store,
   whose entries are `<name>@<version>[_peers]` with `/` written as `+`), and
   scans every fixture source file for a Svelte import specifier or the string
   `isCustomElement`. `harness.mjs` is excluded from that scan — it is
   driver-side orchestration and its own comment mentions `isCustomElement`.
2. **Optional peers really are optional.** Neither npm nor pnpm installs
   `vue` into the React fixture or `react` into the Vue fixture, and the
   fixtures assert that, so "React and Vue remain optional peer dependencies" is
   measured rather than assumed.
3. **`setManifestData` does NOT dispatch `manifestchange`.** Only the
   `setManifest` (HTTP) path does, at `viewer.svelte.ts:745`. Viewer 1 therefore
   supplies its manifest through the property tier (`manifestId` +
   `manifestJson`, which the element's effect requires TOGETHER) and viewer 2
   loads `/manifest.json` over HTTP — which is both the `manifestchange` source
   and the two-viewer isolation proof.
4. **A 120×120 image has no zoom headroom.** With OpenSeadragon's default
   `maxZoomPixelRatio`, `state.zoomIn()` on a tiny source is clamped straight
   back by `applyConstraints()` and the `frame`-cadence readout never moves —
   which looks exactly like a broken cadence. The fixture manifest's canvases
   are 1600×1200 for this reason.
5. **A `state`-cadence contrast readout needs a HOISTED projection.** With an
   inline arrow the projection object is re-created on every render, so it
   recomputes from a fresh cache and tracks the zoom anyway, masking the
   contrast. Both fixtures hoist `selectZoomThousandths`.
6. **React's equality gate is only observable in a component that re-renders
   for nothing else.** An unmemoised inline `equals` mints a new projection on
   every render, so a sibling selector that re-renders the component resets the
   gate. `GatedReadout` is therefore a SIBLING of `<ViewerOne>` under `App`, not
   a child. (Vue has no such constraint: its composable's `computed` and
   projection persist for the component's lifetime.)
7. **React's viewer-1 handle is created in `App`, above the viewer**, so it
   survives the unmount/remount leg and exercises "a handle whose viewer
   unmounts reverts to unbound and rebinds cleanly".
8. **Hydration-mismatch reporting differs by framework, and both needed care.**
   Vue compiles it out of production builds unless
   `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` is defined — the Vue fixture's
   `vite.config.js` sets it to `true`, and without it the zero-mismatch
   assertion would be vacuous. React 19 production ignores _extra_ server
   attributes and extra sibling nodes; what it does do on a real mismatch is
   discard the server host and client-render, so the discriminating assertion is
   `hostReused` (an identity check against the node captured before
   `hydrateRoot`), not the console.
9. **Recording framework errors instead of logging them is what keeps the
   "no uncaught page errors" assertion meaningful.** React's root takes
   `onCaughtError` / `onUncaughtError` / `onRecoverableError`; Vue sets
   `app.config.errorHandler`. The Vue `<Boundary>` deliberately does NOT return
   `false` from `onErrorCaptured`, because returning `false` would stop
   propagation and `app.config.errorHandler` would never see the failure.
10. **The fixtures need no plugin SDK to exercise plugins.** `SdkPlugin` is a
    structural, framework-neutral seam owned by core, so `src/fixtures.js`
    hand-authors two plain objects with `kind: 'triiiceratops-plugin'` and their
    own `activate(host)`. One is made to throw on its first activation, which is
    how the `pluginerror` channel and the delivered `PluginError.retry()` are
    driven; the other proves ticket 04's identity-keyed activation survives a
    parent re-render that supplies a NEW array of the SAME plugin objects.
11. **`viewererror` is driven by the documented nav-edge conflict** applied as a
    post-mount `config` change, which doubles as the property-tier
    prop-update proof. `choicechange` is driven by `state.selectChoice(...)`,
    which `ReadonlyViewerState` exposes.
12. **Event identity is witnessed at `document`.** The channels are
    `bubbles: true, composed: true`, so a `document`-level listener runs AFTER
    the wrapper's own element-level listener and can compare the payload the
    framework handler received against `event.detail` by identity. `event.target`
    retargets to the host element, so the forwarded `id` host attribute
    (`viewer-1` / `viewer-2`) is what attributes each event to its viewer.
13. **The built testing entry works fine in the browser.** Ticket 08's
    `ReferenceError: self is not defined` is a bare-Node-only problem; both
    fixtures import `triiiceratops/testing` straight into the client bundle.

Mutation-tested, so the fixtures are not vacuous. Nine deliberate defects were
planted into the INSTALLED packed package (or the built server HTML) and every
one was caught: the applier skipping `searchProvider`/`plugins`; React's
callbacks handed the `CustomEvent` instead of its `detail`; `frame` cadence
collapsed to `state`; React's unmount cleanup not calling `controller.destroy()`;
`assertViewerElementCompatible` removed from registration (React and Vue — the
conflict route then hangs at `pending`, which is exactly the failure mode the
probe exists to prevent); Vue's selector runtime cached outside the `computed`
(the `<KeepAlive>` rewire); the applier skipping the property tier under Vue;
and a planted server/client mismatch in each fixture's built `ssr.html`.

Verified: `PACKED_ONLY=framework-react pnpm test:packed` and
`PACKED_ONLY=framework-vue pnpm test:packed` both exit `0` with `PASS` under npm
AND pnpm. The full `pnpm test:packed` matrix was run once, end to end: **every
one of the 25 fixtures passes under both package managers except `csp-svelte`
and `csp-wc-iife`**, which fail only at their third engine — Playwright cannot
launch **webkit** on this machine, the same missing-system-libraries problem
already recorded for ticket 02 (`sudo playwright install-deps` needs root).
Both of those fixtures pass on chromium and firefox in the same run, and CI
installs webkit with `--with-deps`, so this is a local environment limitation,
not a regression. The driver therefore exits `1` here and is expected to exit
`0` in CI.

Two things ticket 10 should know:

- The `packed-consumers` CI job has a 60-minute timeout and now runs two more
  fixtures plus one extra `npm install` (the Node import probe pulls `react` and
  `vue`). Nothing here measured the CI job's total duration; if it starts
  timing out, that is the cause.
- Nothing in `packages/` changed, so `api-reports/` is unchanged and the
  changeset gate does not fire for this ticket.

### Ticket 10 outcome

Most of the packaging was already in place when this ticket started, and saying so is the
point: `./react` and `./vue` were already declared subpaths of core with `types` + `import`
conditions, `react ^19.0.0` / `vue ^3.5.0` were already optional peers with neither in
`dependencies`, `api-report.ts` already annotated `searchProvider` and `plugins`
`attributeSupported: false`, the declaration report and `exports.json` already covered both
subpaths, `PUBLISHABLE_PACKAGES` already listed six with core first and already built
`build:element` before packing, and the tarball allowlist's extension rules already ADMITTED
`dist/react.*` / `dist/vue.*`. What was missing was enforcement — nothing would have failed
if any of it regressed.

Five gaps closed, each mutation-tested:

1. **The `.d.ts` promise was not enforced per entry point, and the whole-package check could
   not express it.** `check:dts-svelte-types` allows a compiled Svelte component's
   declaration to import `svelte`, keyed by FILE — so it would have happily let `./react`
   re-export something reaching `components/TriiiceratopsViewer.svelte.d.ts`, which is
   exactly the leak tickets 06 and 07 were verbally constrained to avoid. `dtsSvelteImports.ts`
   now runs a SECOND, strict pass: every export subpath except `.` (`SVELTE_CONSUMER_SUBPATHS`)
   is walked with its OWN visited set and no allowance at all. A subpath added later is strict
   by default. Measured on the real `dist`: `./react`, `./vue`, `./selectors`, `./testing`, and
   `./image-export` reach **zero** `svelte*` specifiers; `.` keeps its documented single
   residual. **The discriminating mutation** — appending
   `export { default as __Planted } from './components/TriiiceratopsViewer.svelte';` to
   `dist/react.d.ts` — fires ONLY the new section, and the old check passes it. A plain
   `import type { Component } from 'svelte'` in `dist/framework/props.d.ts` fires both.
2. **Nothing checked the built wrapper RUNTIME graphs.** New
   `packages/core/scripts/check-framework-entries.mjs` (`pnpm check:framework-entries`) walks
   what `exports["./react"].import` / `["./vue"].import` actually point at and fails on any
   `svelte*` specifier or on the OTHER framework. Four planted defects all caught:
   `import 'svelte'` in `dist/framework/handle.js` (both subpaths), `import 'vue'` in
   `dist/react/index.js`, a deleted element bundle, and an entry emptied of its wrapper
   re-export (the non-vacuity guard). Real result: `./react` = 22 modules, bare imports
   `react`; `./vue` = 21 modules, bare imports `vue`.
3. **Nothing asserted the tarball CONTAINS the wrappers.** `assert-tarball-contents.mjs`
   gained `REQUIRED_CORE_DIST_FILES` (`dist/react.js`, `dist/react.d.ts`, `dist/vue.js`,
   `dist/vue.d.ts`), `assertCoreExportTargets` (every `./dist/...` target the PACKED
   `exports` names must exist in the archive; `./react` and `./vue` must each declare both
   conditions), and `assertCoreOptionalPeers` (ranged, optional, absent from `dependencies`).
   A `selfCheckFrameworkSubpathAssertions()` guard proves all three bite, alongside the
   existing planted-test and peer-pin self-checks.
4. **Registry smoke never touched the framework subpaths.** It now resolves all four core
   subpaths from a consumer with NO peer installed, asserts the published core's own
   `peerDependenciesMeta` marks react/svelte/vue optional and that npm auto-installed none of
   them, then builds ONE THROWAWAY CONSUMER PER FRAMEWORK — published core plus exactly one
   peer, at the range read out of the published package rather than hard-coded — and imports
   that subpath for real in Node with no `window`/`document`/`customElements`.
5. **The inert-attribute annotation was a bare boolean.** `attributeSupported: false` now
   carries an `attributeNote` saying why (`searchProvider` is a function, `plugins` an array
   of live objects; the attribute could only stringify them), so a future contributor reads a
   reason rather than an apparent oversight. This is the only `api-reports/` change.

Facts worth not rediscovering:

1. **A regex scan of the built wrapper entries reports FALSE imports.** `svelte-package`
   preserves doc comments, and `dist/vue.js`'s header contains a literal
   `from 'triiiceratops/vue';` inside a ` ```vue ` example — a regex walk reports
   `triiiceratops/vue` as a bare import of itself. `check-framework-entries.mjs` parses with
   the TypeScript AST (`ScriptKind.JS`) instead, which also picks up `import(...)` call
   expressions properly. `check-testing-entry.mjs` gets away with regexes only because its
   input is a comment-free vite bundle.
2. **The element bundle IS in the wrappers' runtime graph, and is clean.** The substrate's
   `import('../triiiceratops-element.js')` is followed like any other relative import; a TS
   parse of the 1.4 MB bundle finds **zero** module specifiers (everything, Svelte included,
   is bundled) and costs ~0.4 s. So "Svelte stays behind the custom-element boundary" is
   measured, not assumed. A naive regex over that file matches multi-line garbage out of
   OpenSeadragon string literals — another reason for the AST.
3. **`check:framework-entries` runs at the end of `build:element`, not `build:lib`**, and
   deliberately: it asserts the graph REACHES `dist/triiiceratops-element.js`, which
   `build:lib` has not produced yet (and `svelte-package` clears `dist/`). That turns the
   build-ordering trap into a build failure instead of a runtime one. Confirmed in the
   release path: `pnpm release:pack` prints `check:runtime-deps` → `dts-svelte-types` →
   `check-testing-entry` → `check-element-artifact` → `check-framework-entries`, in order.
4. **The tarball allowlist needed no new PERMISSION rule.** `dist/react.js` and
   `dist/react.d.ts` already matched the `.js` / `.d.ts` suffix rules, and nothing in
   `isRejectedPath` touches them. The gap was the opposite direction — nothing REQUIRED them
   — so the ticket's "add `dist/react.*` and `dist/vue.*` to the allowlist" is satisfied by a
   required-files list plus a header note, not by a new suffix.
5. **Ticket 12's breaking changeset was already accurate** (`.changeset/drop-legacy-plugindef.md`,
   `'triiiceratops': major`): it names every removed member, the `plugins` narrowing to
   `readonly SdkPlugin[]`, the absence of a deprecation shim, the guard tightening, and a
   migration recipe. Nothing needed correcting. Ticket 10's own changeset
   (`framework-wrappers-public-contract.md`, `minor`) describes the packaging/enforcement
   contract only and adds no second React/Vue release entry — 06 and 07 already own those.
6. **`.` is still not Svelte-free, deliberately.** See "Resolution of ticket 12's `.` entry
   finding"; ticket 10 did NOT change it, and `SVELTE_CONSUMER_SUBPATHS` now encodes the
   exception in code with the rationale attached.

Verified, all exiting 0: `pnpm api:report` (only `custom-element.json` changed; re-running
`--no-build` reproduces it byte-for-byte), `pnpm api:check` (76 allowlisted `any`, no new
leakage, no stale entries), `pnpm --filter triiiceratops pack` (both wrapper entries and all
of `dist/react/`, `dist/vue/` present), `pnpm release:reproducible` (all six tarballs
byte-identical across two clean builds), `pnpm release:pack --out …` (six tarballs +
`SHA256SUMS` + `release-manifest.json`, core first), core `check` / `test` (848 → 854) /
`lint`, workspace `check` / `test` / `lint` / `format:check`, `docs:examples:check` (90, in
sync), `PACKED_ONLY=__tarball_only__ pnpm test:packed` (every tarball assertion including the
four new ones), and `PACKED_ONLY=framework-react,framework-vue pnpm test:packed` (PASS under
npm AND pnpm).

`pnpm release:smoke` was NOT run: it requires a registry test manifest, and none is
available. Pointing it at the public registry would install the already-published
`1.0.0-rc.31`, which predates the framework wrappers, so `triiiceratops/react` would fail for
a reason that has nothing to do with this work. What WAS validated offline instead, against
the freshly packed tarball installed with `file:`: the exact probe bodies the script writes
(both subpaths import DOM-free, deliver their six named exports, expose no default export,
and register no `globalThis.Triiiceratops`), the forbidden-peer expectations (npm installs no
`vue` or `svelte` beside `react`, and no `react` or `svelte` beside `vue`), the four
no-peer subpath resolutions, and the published peer metadata
(`react ^19.0.0` / `svelte ^5.0.0` / `vue ^3.5.0`, all optional, none auto-installed). Only
the registry-fetch plumbing itself is unexercised, and that code shape is unchanged from
before this ticket.

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
