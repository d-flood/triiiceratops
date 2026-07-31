## What to build

Finalize the framework wrappers as a supported public and release-tested core contract.
Update package metadata, generated API reports, tarball and registry smoke validation,
runtime- and type-dependency assertions, and release notes so the exact artifacts verified
by the packed matrix are publishable and reproducible.

## Where to start

- Read the core export map and peer metadata in `packages/core/package.json`, including the
  existing `sideEffects` list (the element bundles are already listed) and the `./element`
  and `./element/register` exports.
- Read declaration discovery and custom-element snapshot generation in `scripts/api-report.ts`
  and `scripts/api-report/dts.mjs`.
- Read public API enforcement in `scripts/check-public-api.mjs`.
- Read package ordering and artifact construction in `scripts/release/packages.mjs` and
  `scripts/release/pack-artifacts.mjs`. The publishable package count must remain unchanged.
- Read `test-consumers/driver/assert-tarball-contents.mjs` — its allowlist gates which files
  may appear in the tarball, so the new `dist/react.*` and `dist/vue.*` files must be added.
- Extend `scripts/release/smoke-registry.mjs` and existing tarball-content assertions for
  explicit React/Vue subpath resolution.

## Contract

- `triiiceratops/react` and `triiiceratops/vue` are subpaths of core, not packages.
- Both exports point to precompiled JS and declarations and use named exports.
- React `^19` and Vue `^3.5` are optional peers. They are **not** core runtime dependencies.
- Svelte remains optional and is not required by framework consumers at runtime **or** at
  type-check time. The ticket 03 guard must run in the release path.
- The two new entry modules must import no `svelte*` specifier; extend
  `check:runtime-deps` (or its sibling check) to assert this for the built `dist/react.js`
  and `dist/vue.js` graphs.
- The build-time assertion from ticket 05 — that `dist/triiiceratops-element.js` exists for
  the wrappers' relative dynamic import — runs in the release build, which must therefore
  order `build:element` before any artifact validation of the wrapper entries.
- API reports include the two subpaths, `searchProvider`, read-only `viewerState`, and
  `viewerstateavailable` with correct property/event classifications. The inert
  `searchprovider` observed attribute is **annotated as unsupported** in the snapshot so a
  future contributor does not wire it up.
- Existing plugin SDK exports remain source compatible, and its API report reflects only the
  intentional implementation-ownership change from ticket 01.
- Release packaging still contains the same six publishable packages, with core before the
  SDK.
- Registry smoke installs the appropriate optional peer before resolving and importing each
  framework subpath.
- Add the repository-required changeset for the new core public contract. Do not create
  separate React/Vue release entries.

## Out of scope

- Do not create `@triiiceratops/react` or `@triiiceratops/vue`.
- Do not add React, Vue, or Svelte to core production dependencies.
- Do not change unrelated API snapshots or package ordering.
- Do not publish a release or modify registry state.
- Do not change the `./element` or `./element/register` exports.

## Acceptance criteria

- [ ] Public API checks recognize both subpaths and the custom-element bridge with no unreviewed drift, and the inert `searchprovider` attribute is annotated.
- [ ] Core tarball inspection contains compiled wrapper JS and declarations, the allowlist is updated, and optional peer metadata is correct.
- [ ] Built `dist/react.js` and `dist/vue.js` graphs import no `svelte*` specifier, and no published `.d.ts` reachable from them does either.
- [ ] Reproducibility and release artifact construction pass with the unchanged six-package set.
- [ ] Registry smoke logic covers both framework subpaths, installing the right optional peer first.
- [ ] A changeset describes the new core framework-wrapper contract.

Run:

```sh
pnpm api:report
pnpm api:check
pnpm --filter triiiceratops pack
pnpm release:reproducible
pnpm release:pack --out /tmp/triiiceratops-framework-release
```

Success is every command exiting `0`, API snapshots matching generated output, a core tarball
containing both subpaths, and a six-package release manifest/artifact set. If a registry test
manifest is available, additionally run:

```sh
pnpm release:smoke -- --manifest /path/to/release-manifest.json
```

## Blocked by

- 09 (`09-packed-framework-consumers.md`)
