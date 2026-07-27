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
    - vendors the freshly packed tarball to `vendor/triiiceratops.tgz` and
      rewrites the fixture's `triiiceratops` dependency to `file:` it,
    - copies the shared local manifest into place,
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

Each fixture is self-describing: `harness.mjs` exports `{ buildScript,
serveDir, manifestTarget, browser, assert }`. Assertions live **with** the
fixture; the driver only orchestrates.

## Determinism

Fixture lockfiles (`package-lock.json` for npm, `pnpm-lock.yaml` for pnpm) are
committed so third-party dependency resolution is stable. The driver injects the
**freshly packed** tarball at run time (a `file:` dependency at a fixed relative
path), so only the tarball's own integrity entry moves between runs — installs
run non-frozen for exactly this reason. `vendor/*.tgz` is git-ignored.

## Seams for later tickets

Clearly-marked extension points — later tickets **add to this harness** rather
than building their own:

- **`PACKAGES_TO_PACK`** (`driver/run.mjs`): add the SDK + plugin packages here
  (tickets 12, 13, 15–17).
- **`FIXTURES`** (`driver/run.mjs`): add plugin fixtures (12, 15–17), adapter
  fixtures (13), and the SDK Svelte/React/Vue/Lit adapter fixtures. New fixtures
  drop a directory under `fixtures/` with a `harness.mjs`.
- **Core-only dependency-absence assertion** (ticket 20): hooks in after the
  pack step (alongside the CSS assertion) once the plugin packages have moved
  their deps out of core.
- **Theme identifier casing**: `assert-tarball-css.mjs` still expects the
  pre-1.0 `Teal` identifier; ticket 22 renames it to lowercase `teal`.

## Out of scope (this ticket)

Plugin / SDK-adapter / React / Vue / Lit fixtures; the core-only "no plugin-only
deps" assertion; Firefox/WebKit/mobile and CSP pages (Chromium-only here);
registry-install smoke tests. See the epic SPEC.
