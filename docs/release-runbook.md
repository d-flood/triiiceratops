# Release runbook

How triiiceratops ships a version. The pipeline **promotes the exact artifacts
that passed required CI** — publication never rebuilds — and every package
publishes with npm provenance. This runbook is the operator's checklist for the
full **RC → soak → stable** flow.

> Scope: the six publishable packages — `triiiceratops` (core),
> `@triiiceratops/plugin-sdk`, and the four plugins
> (`plugin-image-manipulation`, `plugin-image-download`, `plugin-pdf-export`,
> `plugin-annotation-editor`). Core versions as `1.0.0-rc.N`; the SDK and plugins
> version independently and entered at `1.0.0-rc.0`.

## The promotion model (why publish never rebuilds)

The version bump is baked into the source **before** CI packs, so the tarballs CI
verifies are already the ones a release publishes:

```text
 feature PRs (each with a changeset)
        │
        ▼
 Version workflow  ──►  "Version Packages" PR  ──►  merge to main
   (changeset version)     (bumps all 6 versions)        │
                                                         ▼
 Required CI ("Run Tests") on the merged commit
   • all required gates (lint, types, unit, contract, coverage,
     packed consumers, SSR, E2E, a11y, audit, perf, API, docs)
   • reproducibility  — two clean builds → identical tarball checksums
   • release-artifacts — build:all + pack 6 .tgz + SHA256SUMS + manifest
                         → uploaded as the `release-tarballs` artifact
        │  (success on main)
        ▼
 Release workflow (publish.yml)  — NO build step
   promote → download the SHA-matched `release-tarballs`, `sha256sum -c`,
             `npm publish <tgz>` per package (provenance via OIDC)
   smoke   → install the EXACT published versions from the registry; assert
   release → create the GitHub release  (only after smoke passes)
```

Key property: the publish job downloads the artifact from a specific CI **run id**,
so the bytes it publishes are exactly the bytes that passed every gate for that
commit SHA. The checksum verification (`sha256sum -c SHA256SUMS`) is the tamper /
mismatch guard.

### Reproducibility

`scripts/release/verify-reproducible.mjs` (CI job **Release Reproducibility**,
`pnpm release:reproducible`) does two independent clean builds of the same SHA and
asserts all six tarballs are byte-identical.

- **Excluded variable metadata: none.** `npm pack` normalises file mtimes to a
  fixed epoch, sorts archive entries, and zeroes the gzip header mtime/OS bytes,
  so the whole `.tgz` is compared with nothing masked.
- If this ever regresses (e.g. a build embeds a timestamp), fix the build to be
  deterministic rather than adding an exclusion.

Local check:

```bash
pnpm release:reproducible
```

## Provenance & npm trusted publishing (OIDC)

All six packages set `publishConfig.provenance: true`, so `npm publish` generates
a provenance attestation. The publish job requests an OIDC token
(`permissions: id-token: write`) and updates npm to an OIDC-capable version.

**Registry-side setup (one-time, per package — requires npm human action):**

1. On npmjs.com, for each of the six packages, open **Settings → Trusted
   Publisher** and add a GitHub Actions trusted publisher:
    - Repository: `d-flood/triiiceratops`
    - Workflow filename: `publish.yml`
2. With trusted publishing configured, `npm publish` authenticates via the OIDC
   token exchange — **no `NPM_TOKEN` is needed**. The `NODE_AUTH_TOKEN` wired in
   the workflow is only a fallback for a package not yet enrolled in trusted
   publishing; remove it once all six are enrolled.
3. New scoped packages must exist (or be publishable) under the `@triiiceratops`
   org with public access; `publishConfig.access` is `public`.

Verify provenance after a publish:

```bash
npm view triiiceratops --json | node -e "const p=JSON.parse(require('fs').readFileSync(0));console.log(p.dist?.attestations ?? 'no attestations')"
```

## Versioning (Changesets, `rc` pre mode)

The repo is in Changesets **pre mode** with tag `rc` (`.changeset/pre.json`).

- Every change ships with a changeset (`pnpm changeset`).
- On push to main, the **Version** workflow maintains a "Version Packages" PR that
  runs `changeset version`. While in pre mode this produces `-rc.N` bumps and the
  `rc` dist-tag. Merging it lands the bumped versions on main.
- Core continues `1.0.0-rc.N`; the SDK and plugins version independently.

Preview what the next version bump resolves to without changing anything:

```bash
pnpm changeset status
```

## Cutting a release candidate (RC)

1. Ensure every intended change is on main with a changeset.
2. Merge the current **Version Packages** PR. This is the release commit — record
   its SHA.
3. Watch **Run Tests** on that commit go green (this is the required CI whose
   artifacts will be promoted, including `release-artifacts` + reproducibility).
4. The **Release** workflow fires automatically on that success (branch `main`),
   promotes the SHA-matched tarballs, runs the registry smoke test, and creates
   the GitHub release (marked pre-release for `-rc.` versions).

### Dry run (prove the path without publishing)

The publish path can be exercised end-to-end without publishing. Point it at a
completed **Run Tests** run id; it downloads that run's artifacts, verifies
checksums, and runs `npm publish --dry-run`:

```bash
# Find a recent successful "Run Tests" run id on main:
gh run list --workflow "Run Tests" --branch main --status success --limit 5

# Dry-run promotion against that run's artifacts (dry_run defaults to true):
gh workflow run publish.yml -f run_id=<RUN_ID> -f dry_run=true
```

## Soak

The **final** RC must soak before stable:

- **Minimum 7 days.** Deploy the hosted demo **and** documentation site pinned to
  the **exact** final-RC versions (not a range) and leave them running.
- Exercise the real surfaces: viewer rendering, plugin activation, annotation
  persistence, theming, keyboard/a11y paths, and the no-bundler CDN assets.
- **Restart-the-clock rule:** any **release-blocking compatibility, security,
  data-loss, or accessibility fix** during soak requires a **new** final RC and
  **restarts the 7-day clock**. Non-blocking issues may be deferred to a later
  release and do not restart the clock.
- Record soak start/end dates and the exact RC versions in the release notes.

## Promoting to stable

Stable **promotes the exact verified commit and artifacts** from the final RC.

**No-code-change rule:** between the final RC and stable there are **no code
changes** — only version metadata (exiting pre mode + the version bump). If code
must change, it is a new RC and the soak restarts.

Steps:

1. Confirm soak completed with no clock-restarting fixes.
2. Exit Changesets pre mode and land the stable version bump:
    ```bash
    pnpm changeset pre exit
    pnpm changeset version   # or merge the resulting Version Packages PR
    ```
   This flips `1.0.0-rc.N` → `1.0.0` and moves the dist-tag from `rc` to `latest`.
   The only diff from the final RC is version metadata + changelog.
3. Let required CI run on the stable commit and go green (reproducibility proves
   the stable tarballs are deterministic).
4. The **Release** workflow promotes those artifacts to the `latest` dist-tag,
   the registry smoke test installs the exact stable versions, and — only then —
   the GitHub release is created.
5. Verify provenance on all six published packages (command above).

## Adapter canary (non-blocking)

`.github/workflows/canary.yml` runs weekly (and on demand). It re-runs the SDK's
Svelte/React/Vue/Lit adapter suites against each framework's registry `latest`
major and, on a regression, files/updates a GitHub issue. It **never** fails a PR
(no `pull_request` trigger; the adapter run is `continue-on-error`). Its output
feeds a **reviewed** dependency bump — the pinned CI versions change only through
a normal PR, never automatically.

Run it on demand:

```bash
gh workflow run canary.yml
```

## Secrets & one-time human actions

- **npm trusted publishing (OIDC):** enroll all six packages (see above). This is
  registry-side and cannot be automated from this repo.
- **`NPM_TOKEN` (optional/fallback):** only needed for a package not yet enrolled
  in trusted publishing. Remove once all six are enrolled.
- **`GITHUB_TOKEN`:** provided automatically; the workflows request the scopes
  they need (`id-token: write` for provenance, `contents: write` for the release,
  `issues: write` for the canary, `pull-requests: write` for the Version PR).
- **GitHub Pages / demo host:** the soak deploy of the demo + docs at exact RC
  versions is operated outside this repo's release workflows.
