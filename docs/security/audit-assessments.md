# Production dependency audit assessments

This document records the applicability assessment for every advisory that the
production dependency audit (`pnpm audit --prod`) surfaced during the 1.0
cleanup, per the SPEC "Dependency, Type, And Generated-Code Policy":

> Direct runtime dependencies have no known vulnerabilities at release. The
> production graph has no high or critical vulnerabilities. Remaining moderate
> or low transitive findings require a written applicability assessment and
> follow-up.

**Current status:** the audited production set is the **publishable** workspace
packages — `scripts/audit-prod.mjs` skips `private: true` manifests, so the
paused `@triiiceratops/plugin-annotation-editor` is not part of it. Across that
set the gate reports **0 critical / 0 high / 0 moderate / 0 low**, because
`packages/core` now declares **no runtime dependencies at all**.

The one finding this document previously carried open — DOMPurify
`GHSA-55q2-fjhq-7xh7` (vulnerable `<=3.4.12`, patched `>=3.4.13`) — needs no
applicability assessment: `dompurify` was **removed** rather than bumped. IIIF
permits a narrow enough HTML subset that `utils/sanitizeHtml`'s
`renderIiifRichText` parses untrusted markup inertly and rebuilds it from an
explicit allowlist, so there is no general-purpose sanitizer in the graph to
have advisories about. The DOMPurify assessments below are retained as the
historical record of a dependency the viewer no longer has.

A raw workspace-wide `pnpm audit --prod`, which does not skip private manifests,
additionally reports one HIGH — `nanoid` `GHSA-28wg-ghj8-5hjv`, reachable only
through `@triiiceratops/plugin-annotation-editor`'s Annotorious dependencies.
Because that package is private and unpublished, it is outside the shipped
production graph and outside the CI gate; it is recorded here as **open and
unassessed** rather than resolved.

- Last audited: **2026-08-08**
- Next scheduled review: **2026-10-17** (or sooner if a new advisory lands on a
  production dependency; the CI production-audit gate — ticket 22 — enforces
  this continuously).

## How the graph was cleaned

The audit findings that existed before this cleanup were all resolved by
dependency version fixes. `phosphor-svelte` (the source of the build-tool
`vite` peer-dependency advisory class) was removed from the production graph
entirely and replaced with build-time SVG codegen from the dependency-free
`@phosphor-icons/core` devDependency (see `packages/core/scripts/`).

### Direct dependency bump

| Package     | Was      | Now (resolved) | Rationale |
| ----------- | -------- | -------------- | --------- |
| `dompurify` | `^3.3.3` | *removed* | Bumped to `^3.4.11` (3.4.12) to clear the advisories below, then dropped entirely in favour of the first-party IIIF rich-text renderer. |

### Transitive fixes via root `pnpm.overrides`

These packages are pulled in transitively, so their ranges cannot be bumped
directly; the `overrides` block in the root `pnpm-workspace.yaml` raises each
vulnerable range to its patched floor. Overrides are scoped to the vulnerable
version range only, so a non-vulnerable resolution is never forced upward.

| Package    | Pulled in by                                   | Override                         | Resolved |
| ---------- | ---------------------------------------------- | -------------------------------- | -------- |
| `lodash`   | build-side only (`@microsoft/api-extractor`)   | `lodash@>=4.0.0 <4.18.0` → `>=4.18.0` | 4.18.1 |
| `qs`       | private package only (Annotorious → `pixi.js` → `url`) | `qs@<6.15.2` → `>=6.15.2` | 6.15.3 |
| `uuid`     | private package only (`@annotorious/annotorious`) | `uuid@>=13.0.0 <13.0.1` → `^13.0.1` | 13.0.2 |
| `devalue`  | `svelte` (dev/build-side)                      | `devalue@<5.6.4` → `>=5.6.4`     | 5.8.1  |

`devalue` is a build-side dependency of Svelte and does not appear in the
production graph (`pnpm audit --prod` never flagged it); the override is
included to keep the full (non-`--prod`) audit clean as well and matches the
target set recorded in the ticket.

The `qs` and `uuid` overrides are in that same build-only position as of this
revision, for a different reason: both are reached solely through
`@triiiceratops/plugin-annotation-editor`'s Annotorious dependencies, and that
package is now `private: true`. Since `scripts/audit-prod.mjs` audits only the
publishable manifests, neither package is in the shipped production graph any
more; the overrides are retained so the full workspace audit stays clean, and
the `qs` and `uuid` assessments below describe **the full-workspace graph**, not
a production dependency path.

The `lodash` override is in the same position as of this revision. It was added
for `manifesto.js`, which is **no longer a dependency of this project at all**
(the IIIF parser was replaced by first-party code, so nothing in the production
graph reaches `lodash`). `lodash` now resolves only build-side, under the
`@microsoft/api-extractor` devDependency; the override is retained so the full
audit stays clean, and the `lodash` assessments below are **historical** rather
than statements about the shipped graph.

## Advisory assessments

### GHSA-r5fr-rjxr-66jc — lodash prototype/template code injection (was HIGH)

- **Package / path (historical):** `lodash` under `manifesto.js`, which is no
  longer a dependency. `lodash` is now build-side only.
- **Status:** Resolved twice over. Overridden to `>=4.18.0` (resolved 4.18.1),
  the advisory's patched floor; and the dependency path that reached it is gone.

### GHSA-f23m-r3pf-42rh, GHSA-xxjr-mmjv-4gpg — lodash prototype pollution (were MODERATE)

- **Package / path (historical):** `lodash` under `manifesto.js`, which is no
  longer a dependency.
- **Status:** Resolved by the same `>=4.18.0` override (4.18.1), and no longer
  reachable from the production graph.

### GHSA-q8mj-m7cp-5q26, GHSA-6rw7-vpxm-498p, GHSA-w7fw-mjwx-w883 — qs DoS / arrayLimit bypass (MODERATE + LOW)

- **Package / path (full workspace only):** `qs`, transitively under the paused,
  private `@triiiceratops/plugin-annotation-editor` → Annotorious →
  `pixi.js` → `@pixi/core` → `@pixi/utils` → `url` → `qs`. That package is
  `private: true` and unpublished, so this path is not in the audited production
  set.
- **Status:** Resolved. Overridden to `>=6.15.2` (resolved 6.15.3); the highest
  patched floor across these advisories is `>=6.15.2`. No longer reported.

### GHSA-w5hq-g745-h8pq — uuid missing buffer bounds check (was MODERATE)

- **Package / path (full workspace only):** `uuid` under
  `@annotorious/annotorious`, reached only through the paused, private
  `@triiiceratops/plugin-annotation-editor` — not in the audited production set.
- **Status:** Resolved. Overridden to `^13.0.1` (resolved 13.0.2); patched
  version per the advisory is `>=13.0.1`. Pinned within the 13.x major to avoid
  an unnecessary major jump for Annotorious.

### DOMPurify advisories (were MODERATE + LOW)

The following DOMPurify advisories all applied to the previously-resolved
`3.3.3` and are cleared by shipping `>=3.4.11` (resolved 3.4.12):

- GHSA-cmwh-pvxp-8882 (MODERATE, patched `>=3.4.11`)
- GHSA-rp9w-3fw7-7cwq, GHSA-hpcv-96wg-7vj8, GHSA-r47g-fvhr-h676 (MODERATE, patched `>=3.4.6`/`>=3.4.7`)
- GHSA-76mc-f452-cxcm, GHSA-39q2-94rc-95cp, GHSA-h7mw-gpvr-xq4m, GHSA-crv5-9vww-q3g8, GHSA-v9jr-rg53-9pgp (MODERATE, patched `>=3.4.0`/`>=3.4.7`)
- GHSA-vxr8-fq34-vvx9 (LOW, patched `>=3.4.9`)
- GHSA-gvmj-g25r-r7wr (LOW, patched `>=3.4.8`)

**Status:** Resolved by the `dompurify` bump to `^3.4.11` (3.4.12).

### GHSA-x4vx-rjvf-j5p4 — DOMPurify `IN_PLACE` mode trusts attacker-controlled `nodeName` (LOW, no upstream patch)

- **Package / path:** `dompurify` (direct dependency).
- **Advisory:** vulnerable versions `<=3.4.6`; patched versions `<0.0.0` — i.e.
  the maintainers have not published a dedicated patch release for this issue.
- **Applicability:** **Does not apply to this project.**
  1. **Out of the vulnerable range.** Triiiceratops now ships DOMPurify
     `>=3.4.11` (resolved 3.4.12). The advisory's vulnerable range is
     `<=3.4.6`, so the shipped version is outside it and `pnpm audit --prod` no
     longer reports it.
  2. **Vulnerable mode is not used.** The advisory requires DOMPurify's
     `IN_PLACE` mode operating on attacker-supplied live DOM nodes. Core uses
     DOMPurify only to sanitize IIIF-derived HTML *strings* (metadata /
     structured labels) into a returned, freshly-parsed fragment — never
     `IN_PLACE` and never over attacker-constructed live node objects — so the
     preconditions for this advisory are not met regardless of version.
- **Follow-up:** Re-check on the scheduled review date above. If upstream
  publishes a dedicated fix, adopt it; the CI production-audit gate will flag
  any regression that reintroduces a vulnerable resolution.
