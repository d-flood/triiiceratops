---
'triiiceratops': minor
---

Finalize `triiiceratops/react` and `triiiceratops/vue` as supported, release-tested
subpaths of core rather than experimental additions. They are subpaths — not
separate `@triiiceratops/react` / `@triiiceratops/vue` packages — so the release
still promotes the same six publishable tarballs, core first.

Both subpaths resolve to precompiled JS and declarations with named exports only,
and `react ^19` / `vue ^3.5` are OPTIONAL peer dependencies. Neither is a runtime
dependency of core, and neither obliges the other: a React application installs no
Vue, a Vue application installs no React, and neither installs Svelte.

What now enforces that, so it cannot regress into a release:

- **The no-Svelte type promise is checked PER ENTRY POINT.** `check:dts-svelte-types`
  already walked the whole published declaration graph, but its allowance for a
  compiled Svelte component's declaration is keyed by file — so it would have let
  `./react` re-export something reaching `TriiiceratopsViewer.svelte.d.ts`. Every
  export subpath except `.` is now additionally walked on its own, with no
  allowance at all: `./react`, `./vue`, `./selectors`, `./testing`, and
  `./image-export` must reach zero `svelte*` specifiers. `.` keeps the compiled
  component, because `.` is the Svelte-consumer entry its `svelte` export
  condition targets.
- **The built wrapper graphs are checked too.** A new `check:framework-entries`
  walks what `exports["./react"].import` and `exports["./vue"].import` actually
  point at and fails on any `svelte*` specifier or on the other framework. It
  cannot pass vacuously: each entry must reach its own peer and must reach the
  self-contained element bundle it lazy-loads by relative specifier — which also
  pins the build order, since `svelte-package` clears `dist/` and the element
  bundle is written by a later step.
- **The published tarball is checked against its own export map.** Core's packed
  archive must contain `dist/react.js`, `dist/react.d.ts`, `dist/vue.js`, and
  `dist/vue.d.ts`, every other `./dist/...` target its `exports` names must exist,
  `./react` and `./vue` must each declare both `types` and `import`, and
  `react` / `vue` / `svelte` must be declared, ranged, optional peers that appear
  nowhere in `dependencies`.
- **The registry smoke installs the optional peer.** After the six published
  packages resolve, it now also resolves all four core subpaths from a consumer
  with no peer installed at all, then builds one throwaway consumer per framework
  — published core plus exactly one peer, at the range the published package
  itself declares — and imports that subpath for real in plain Node with no
  `window`, `document`, or `customElements`, asserting the named exports arrive,
  there is no default export, nothing registers a browser runtime, and the other
  framework and Svelte were never installed.

The custom-element API snapshot's inert `searchprovider` and `plugins` observed
attributes now carry an explanatory note beside `attributeSupported: false`.
Svelte derives an observed attribute from every declared prop; these two inputs
carry a function and an array of live plugin objects, so the property is the only
supported channel and the attribute must not be wired up.
