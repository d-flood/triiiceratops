# Packed-consumer test harness

The **primary release seam** (SPEC → _Testing Decisions_): instead of trusting
source tests, this harness packs real `.tgz` artifacts, installs them into clean
fixture consumers via **both npm and pnpm**, builds each consumer, and asserts
against exactly what a user gets from npm.

Run it from the repo root:

```sh
pnpm test:packed
```

Success is the driver exiting `0` with a `PASS` line per fixture × package
manager.

## How it works

`driver/run.mjs`:

1. **Builds** core's publishable `dist/` (`build:lib`, `build:element`,
   `build:plugins-iife`).
2. **Packs** a real `.tgz` — exactly what npm would publish.
3. **Asserts tarball-level CSS** (`driver/assert-tarball-css.mjs`): design
   tokens, all four built-in themes, `.viewer-root` scoping, zero unscoped
   selectors, and no `a9s-`/`annotorious` CSS in core's stylesheet. This is the
   `distributions.test.ts` contract re-pointed at the packed artifact.
4. For each fixture × each package manager (**npm** and **pnpm**):
    - copies the fixture **out of the workspace** into a temp dir,
    - vendors each freshly packed tarball the fixture declares (`harness.mjs`
      `tarballs`, default `['triiiceratops']`; the adapter fixtures also pull
      `@triiiceratops/plugin-sdk`) to `vendor/<name>.tgz` and rewrites the
      matching `file:` dependency,
    - copies the shared local manifest into place (when a fixture needs one),
    - installs, builds, serves the built output, and runs the fixture's own
      assertions (`harness.mjs`) against Chromium.

Every fixture consumes **only the packed tarball**, never workspace source. All
browser journeys use `shared/local-manifest.json` (a data-URI image) — **no
network IIIF**.

## Fixtures

| Fixture           | What it proves                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `svelte-vite`     | Vite + Svelte app importing `triiiceratops` + `triiiceratops/style.css`; first canvas renders.                      |
| `sveltekit-ssr`   | SSR-safe build, stable server-rendered HTML, hydration with zero mismatch messages, viewer operates post-hydration. |
| `wc-esm`          | Vite vanilla app registering the element through the packaged element entry (ESM import).                           |
| `plain-html-iife` | No bundler; static page loads the element IIFE from the installed package path via `<script>`.                      |
| `plugin-react`    | React plugin consuming `@triiiceratops/plugin-sdk/react` (`useViewerSelector`) against a live packed `ViewerState`. |
| `plugin-vue`      | Vue plugin consuming `@triiiceratops/plugin-sdk/vue` (`useViewerSelector` → readonly ref).                          |
| `plugin-lit`      | Lit plugin consuming `@triiiceratops/plugin-sdk/lit` (`SelectorController`).                                        |
| `plugin-svelte`   | Svelte 5 plugin consuming `@triiiceratops/plugin-sdk/svelte` (`viewerSelector` store) — the tracer-pattern fixture. |
| `framework-react` | React 19 app consuming `triiiceratops/react` + `triiiceratops/testing`: three routes, no Svelte, no plugin SDK.     |
| `framework-vue`   | Vue 3.5 app consuming `triiiceratops/vue` + `triiiceratops/testing`: the same three routes, with `<KeepAlive>`.     |

Each fixture is self-describing: `harness.mjs` exports `{ buildScript,
serveDir, manifestTarget, browser, tarballs, assert }`. Assertions live **with**
the fixture; the driver only orchestrates. The four `plugin-*` adapter fixtures
share one journey (`fixtures/plugin-adapter-assert.mjs`): mount a plugin through
the SDK mount contract, render the selected `toolbarOpen` value, flip it with a
command, and unmount cleanly.

### The framework-wrapper fixtures

`framework-react` and `framework-vue` are the release seam for
`triiiceratops/react` and `triiiceratops/vue`. Each is a plain Vite app whose
only package dependency is the packed core tarball plus its own framework — no
`svelte`, no `@sveltejs/vite-plugin-svelte`, no plugin SDK, and (Vue) no
`compilerOptions.isCustomElement` anywhere, which the fixtures assert against
their own installed `node_modules` and source tree.

Each builds **three routes** driven by one Playwright pass through the shared
journey in `fixtures/framework-consumer-assert.mjs`:

- `index.html` — the whole client contract: automatic shared registration, all
  three prop tiers (including a function-valued `searchProvider` and a new
  plugin array every render), post-mount updates, suppressed unchanged writes,
  both selector cadences against a real OpenSeadragon zoom, every translated
  event channel with exact payload identity, a callable `PluginError.retry()`,
  the imperative handle, a consumer projection failure reaching framework-native
  error capture, the `triiiceratops/testing` handle, unmount/remount, two
  isolated viewers, and (Vue) a `<KeepAlive>` round trip;
- `ssr.html` — rendered at **build time** by `prerender.mjs` with
  `react-dom/server` / `vue/server-renderer` in plain Node (which is also the
  SSR-safety gate), then hydrated in the browser with zero mismatch
  diagnostics;
- `conflict.html` — pre-registers a foreign `<triiiceratops-viewer>` and
  requires a prompt, framework-native version-conflict error.

A driver-level assertion covers the one DOM-free case: both packed subpaths are
imported in plain Node with no browser globals and must register nothing.

## Determinism

The core fixtures commit lockfiles (`package-lock.json` for npm,
`pnpm-lock.yaml` for pnpm) so third-party dependency resolution is stable. The
adapter (`plugin-*`) fixtures instead **exact-pin** their framework versions
(React/Vue/Lit/Svelte) directly in `package.json` for deterministic CI, and
resolve on a non-frozen install. The driver injects the **freshly packed**
tarball(s) at run time (a `file:` dependency at a fixed relative path), so only
the tarball's own integrity entry moves between runs — installs run non-frozen
for exactly this reason. `vendor/*.tgz` is git-ignored.

## Seams for later tickets

Clearly-marked extension points — later tickets **add to this harness** rather
than building their own:

- **`PACKAGES_TO_PACK`** (`driver/run.mjs`): the SDK joined here (ticket 13);
  plugin packages add themselves (tickets 15–17). Core must stay first (the SDK
  type-checks against core's built `dist/`).
- **`FIXTURES`** (`driver/run.mjs`): the SDK adapter fixtures joined here
  (ticket 13: `plugin-react`, `plugin-vue`, `plugin-lit`, `plugin-svelte`);
  plugin fixtures add themselves (15–17). A fixture declares which packed
  tarballs it consumes via `harness.mjs` `tarballs`; the driver injects each via
  `injectTarball(dir, path, depName)`. New fixtures drop a directory under
  `fixtures/` with a `harness.mjs`.
- **Core-only dependency-absence assertion** (ticket 20): hooks in after the
  pack step (alongside the CSS assertion) once the plugin packages have moved
  their deps out of core.
- **Theme identifier casing**: `assert-tarball-css.mjs` expects the lowercase
  `teal` identifier (ticket 19 renamed the former `Teal`) and the `--tri-*`
  public CSS token namespace.

## Out of scope

The core-only "no plugin-only deps" assertion (ticket 20); per-plugin fixtures
(tickets 15–17); Firefox/WebKit/mobile and CSP pages (Chromium-only here);
registry-install smoke tests. See the epic SPEC.
