---
search:
  exclude: true
---

# Production dependency audit assessments

This document records the applicability assessment for every advisory that the
production dependency audit (`pnpm audit --prod`) surfaced during the 1.0
cleanup, per the SPEC "Dependency, Type, And Generated-Code Policy":

> Direct runtime dependencies have no known vulnerabilities at release. The
> production graph has no high or critical vulnerabilities. Remaining moderate
> or low transitive findings require a written applicability assessment and
> follow-up.

**Current status:** `pnpm audit --prod` reports **no known vulnerabilities**
(0 critical / 0 high / 0 moderate / 0 low).

- Last audited: **2026-07-17**
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
| `dompurify` | `^3.3.3` | `^3.4.11` (3.4.12) | Clears all DOMPurify advisories below (see assessment). |

### Transitive fixes via root `pnpm.overrides`

These packages are pulled in transitively, so their ranges cannot be bumped
directly; the root `package.json` `pnpm.overrides` block raises each vulnerable
range to its patched floor. Overrides are scoped to the vulnerable version
range only, so a non-vulnerable resolution is never forced upward.

| Package    | Pulled in by                                   | Override                         | Resolved |
| ---------- | ---------------------------------------------- | -------------------------------- | -------- |
| `lodash`   | `manifesto.js`                                 | `lodash@>=4.0.0 <4.18.0` → `>=4.18.0` | 4.18.1 |
| `qs`       | `@annotorious/openseadragon` → `pixi.js` → `url` | `qs@<6.15.2` → `>=6.15.2`      | 6.15.3 |
| `uuid`     | `@annotorious/annotorious`                     | `uuid@>=13.0.0 <13.0.1` → `^13.0.1` | 13.0.2 |
| `devalue`  | `svelte` (dev/build-side)                      | `devalue@<5.6.4` → `>=5.6.4`     | 5.8.1  |

`devalue` is a build-side dependency of Svelte and does not appear in the
production graph (`pnpm audit --prod` never flagged it); the override is
included to keep the full (non-`--prod`) audit clean as well and matches the
target set recorded in the ticket.

## Advisory assessments

### GHSA-r5fr-rjxr-66jc — lodash prototype/template code injection (was HIGH)

- **Package / path:** `lodash` under `manifesto.js`.
- **Status:** Resolved. Overridden to `>=4.18.0` (resolved 4.18.1); patched
  version per the advisory is `>=4.18.0`. No longer reported.

### GHSA-f23m-r3pf-42rh, GHSA-xxjr-mmjv-4gpg — lodash prototype pollution (were MODERATE)

- **Package / path:** `lodash` under `manifesto.js`.
- **Status:** Resolved by the same `>=4.18.0` override (4.18.1).

### GHSA-q8mj-m7cp-5q26, GHSA-6rw7-vpxm-498p, GHSA-w7fw-mjwx-w883 — qs DoS / arrayLimit bypass (MODERATE + LOW)

- **Package / path:** `qs`, transitively under
  `@annotorious/openseadragon` → `pixi.js` → `@pixi/core` → `@pixi/utils` →
  `url` → `qs`.
- **Status:** Resolved. Overridden to `>=6.15.2` (resolved 6.15.3); the highest
  patched floor across these advisories is `>=6.15.2`. No longer reported.

### GHSA-w5hq-g745-h8pq — uuid missing buffer bounds check (was MODERATE)

- **Package / path:** `uuid` under `@annotorious/annotorious`.
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
