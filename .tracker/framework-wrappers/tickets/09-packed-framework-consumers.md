## What to build

Make packed consumer applications the release seam for the whole framework-wrapper contract.
Two fixtures — one React 19, one Vue 3.5 — install the real tarball under both package
managers and verify the client contract, server rendering with hydration, and prompt
version-conflict failure. One driver-level assertion covers the DOM-free import case.

## Why two fixtures and not six

The originally planned split (`framework-ssr-react`, `framework-ssr-vue`,
`framework-conflict`) does not pay for itself: those fixtures would install the same
dependencies as the browser fixtures, and both hydration and the conflict probe **require a
real DOM** — hydration because it is the point, and the conflict case because it must
pre-register a foreign constructor in `customElements`. Consolidating covers strictly more
than six fixtures would while keeping the packed matrix affordable: it currently runs 23
fixtures × 2 package managers × 2 Node versions.

## Where to start

- Read fixture orchestration, `FIXTURES`, `PACKAGE_MANAGERS`, and `PACKED_ONLY` handling in
  `test-consumers/driver/run.mjs`.
- Read the existing driver-level assertions near the pack step (tarball contents, tarball CSS,
  the core-only dependency check around line 350) — the Node import assertion belongs there,
  not in a fixture.
- Model the client fixtures on `test-consumers/fixtures/plugin-react` and `plugin-vue`, but
  consume **only** the packed core tarball: no plugin SDK, no Svelte, no Svelte Vite plugin.
- Use `test-consumers/fixtures/sveltekit-ssr` as prior art for serving server-rendered HTML and
  asserting hydration without mismatch diagnostics. Do not turn this into a meta-framework
  integration.
- Reuse the local manifest and fixture-owned assertion pattern documented in
  `test-consumers/README.md`.

## Contract

### Fixtures

- `framework-react` depends on packed `triiiceratops` and exactly pinned React 19 (plus
  `react-dom`); `framework-vue` on packed `triiiceratops` and exactly pinned Vue 3.5. Neither
  depends on `svelte`, `@sveltejs/vite-plugin-svelte`, or the plugin SDK, and neither configures
  a Svelte plugin. Vue's fixture configures **no** `compilerOptions.isCustomElement`.
- Tests exercise public wrapper behavior only: no framework internals, Svelte effects, private
  fields, or subscription collection sizes.
- Each fixture serves multiple routes and is driven by one Playwright pass.

### Client route — the full contract

- Automatic shared registration with no explicit registration import; multiple wrapper
  instances share it safely.
- All three prop tiers: attribute-tier kebab attributes, property-tier objects **and** the
  function-valued `searchProvider` arriving as properties rather than stringified attributes,
  and forwarded `class`/`style`/`id`/`data-*`/`aria-*`.
- Post-mount prop updates take effect; an unchanged prop value writes nothing.
- No extra layout element around the custom element.
- Commands through the handle; selected reads at `state` cadence and at `frame` cadence during
  a real zoom or pan.
- Every translated event channel, with exact object identity preserved and a callable plugin
  `retry()` where the fixture produces a plugin failure.
- The imperative handle exposes the owning element and the same state instance selectors read,
  and becomes unavailable after unmount.
- React covers changed inline projections and equality inputs with no manual memoization; Vue
  covers projections reading changing Vue reactive dependencies plus a `<KeepAlive>` round trip
  that rebinds and keeps updating.
- Consumer projection and equality failures reach framework-native error capture — never
  `viewererror`, `pluginerror`, silently stale output, or an unhandled core subscription log.
- Unmount/remount clears callbacks and handles. Two viewers share registration but no viewer
  state, selector output, command effect, callback, or handle.
- Plugins survive a parent re-render that supplies an equal plugin list (the consumer-visible
  proof of ticket 04).
- The ticket 08 testing helper is imported and used to drive a real command observed by a real
  selector, proving it works from the tarball with no Svelte installed.

### Server route

- The route is rendered with `react-dom/server` / `vue/server-renderer` and served as HTML.
- Server output contains exactly one inert `<triiiceratops-viewer>` host with the attribute
  tier and forwarded style/ARIA/data attributes. No property-tier values, no shadow-DOM
  internals, no extra layout element.
- Hydration reuses and upgrades the same host with **zero** mismatch diagnostics, and the
  viewer is then operable.

### Conflict route

- The page pre-registers a foreign `triiiceratops-viewer` constructor lacking the `viewerState`
  getter, then mounts the wrapper.
- A prompt framework-native error is captured containing a useful version-conflict diagnostic.
  The failure must not be a hang or a timeout.

### Driver-level assertion

- Alongside the existing tarball and dependency-absence checks, import both packed subpaths in
  Node with no browser globals, asserting evaluation succeeds and no registration side effect
  occurs. No fixture install is needed for this.

## Out of scope

- Do not add Svelte, plugin adapter, browser-runtime implementation, or workspace-source
  assertions to the fixtures.
- Do not add Firefox, WebKit, mobile, CSP, React Native, Next.js, or Nuxt coverage.
- Do not split the SSR or conflict routes back out into separate fixtures.
- Do not merge viewer-wrapper behavior into the existing plugin fixtures.
- Do not reduce package-manager or Node coverage below what the harness already runs.

## Acceptance criteria

- [ ] Each fixture proves no Svelte package and no Svelte Vite plugin is installed or configured, and the Vue fixture proves no custom-element compiler configuration is needed.
- [ ] All prop, callback/emit, helper, handle, dynamic-selector, cadence, error, plugin-survival, and teardown contracts are observed through packed browser behavior.
- [ ] A two-viewer journey proves complete state and lifecycle isolation in both frameworks.
- [ ] Server routes emit the accepted inert-host shape and hydrate with zero mismatch diagnostics, then operate the upgraded viewer.
- [ ] The conflict route captures a prompt native error with a version-conflict diagnostic.
- [ ] The driver-level Node import assertion passes for both subpaths with no browser globals and no registration side effect.
- [ ] The ticket 08 testing helper works from the tarball.
- [ ] Both fixtures pass under npm and pnpm, and the complete pre-existing packed suite remains green.

Run:

```sh
PACKED_ONLY=framework-react pnpm test:packed
PACKED_ONLY=framework-vue pnpm test:packed
pnpm test:packed
```

Success is each command exiting `0`; the first two print a `PASS` line for the selected fixture
under npm and pnpm, and the final command prints `PASS` for every fixture/package-manager
combination with no hydration mismatch output.

## Blocked by

- 04 (`04-identity-keyed-plugin-activation.md`)
- 06 (`06-react-framework-wrapper.md`)
- 07 (`07-vue-framework-wrapper.md`)
- 08 (`08-consumer-testing-helper.md`)
