# Production manifests — not yet vendored

This directory is deliberately empty of manifests.

The `remove-manifesto` epic's corpus draws on four sources: the removed
library's own real-world fixtures (`../vendored/`), IIIF Cookbook recipes
(`../cookbook/`), targeted synthetic fixtures (`../../syntheticManifests.ts`),
and **a manifest from each known production deployment of Triiiceratops** —
this directory.

**What is missing.** The production deployment manifest URLs. They are an open
input held by the maintainer (see `.tracker/remove-manifesto/SPEC.md`, "Open
inputs held by the maintainer") and were not available when ticket 01 was
implemented. Ticket 01's contract says to land everything else rather than block
on them, so that is what happened.

**Partial substitute.** `../demo/` already holds five institutional manifests
taken from the viewer's demo picker, two of which are production deployments the
maintainer runs or is named in (`collections-csntm-manifest.json`,
`zavicajna-digitalna-manifest.json`). They are real-world coverage, but they are
not the deployment list, and they were chosen because the demo picker happened to
reference them rather than because a deployment depends on them.

**What to do when the URLs arrive.**

1. Fetch each manifest and write it here as `<deployment>.json`.
2. Trim to roughly five canvases unless the manifest is kept to test scale,
   preserving whatever feature it is kept for.
3. Add a row to `../PROVENANCE.md`: source URL, upstream license, date
   retrieved, what it is kept for, and what was trimmed.
4. Nothing else. The smoke test in `../../corpus.smoke.test.ts` discovers
   fixtures by glob, so a new file is picked up with no test edit — and if it
   enumerates zero canvases the test fails until it is justified in the
   test's explicit expected-empty list.
