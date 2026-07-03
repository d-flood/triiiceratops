# Slice 18 — Test suite completion, docs rewrite, migration notes

- **Phase:** 5 (Hardening)
- **Status:** not started
- **Depends on:** all other slices (final slice)
- **Findings:** F28 (remainder)
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §5

## Goal

Close the coverage gaps that let F1–F30 ship, rewrite the Annotation Editor docs around
the final surface, and give existing consumers a migration path.

## Files

- `src/lib/plugins/annotation-editor/**` tests (new integration suite)
- `tests/` (Playwright)
- `docs/plugins.md` (Annotation Editor section rewrite)
- `CHANGELOG.md` / changeset (migration notes)

## Implementation

1. **Integration test suite** (mocked adapter + mocked OSD/Annotorious, driving the
   real manager+store): full lifecycle — init → draw → edit body → canvas change →
   reload → delete → destroy — asserting adapter call counts/payloads and
   `manifestsState` contents at each step. This is the harness that would have caught
   F1/F2/F3/F4/F7/F11/F12; keep it fast and adapter-agnostic so future slices extend it.
2. **Playwright flow** (demo app): enable plugin → draw rectangle → add body → reload
   (persistence) → point tool → click → body via custom editor example → reload →
   delete → confirm gone. Add to `playwright.config.ts` projects as appropriate;
   run with `pnpm test:e2e`.
3. **Docs rewrite** (`docs/plugins.md` Annotation Editor section):
   - v2 adapter contract front and center (5 functions, optional `hydrate`, optional
     id-returning `create`/`update`), the "plugin does display sync / ids / stamping /
     errors" guarantees, the conformance test kit (slice-10);
   - point behavior (true `PointSelector`, integer canvas px, `pointStyle`);
   - full config reference table (`tools`, `defaultTool`, `defaultMotivation`,
     `drawingStyle`, `pointStyle`, `ui.*`, `bodyEditor`, `extension` incl. `subscribe`,
     `onPersistenceError`, `target`/`position`);
   - body-editor recipes: Svelte component variant and framework-agnostic `render`
     variant (vanilla DOM example);
   - the point-only + custom-body walkthrough (mirrors the demo-consumer example).
4. **Migration notes** (CHANGELOG + a short section in docs):
   - adapters no longer inject display state (`manifestsState`) — remove that code;
   - `__fullBodyLoaded` is read from `load()` results but no longer round-trips;
   - undo/redo semantics changed (persistence-aware; old behavior resurrected data);
   - window CustomEvents (`triiiceratops:annotation-editor:*`) deprecated in favor of
     the per-viewer bus — shim removed next major;
   - stored point annotations need no migration (they were already `PointSelector`).

## Acceptance

- `pnpm exec vitest run` green (full repo), `pnpm check`, `pnpm lint` clean.
- `pnpm test:e2e` green locally.
- Docs build/lint passes if the repo has one for docs (zensical config present —
  verify with the repo's docs build if wired; otherwise proofread rendered markdown).
- Every finding F1–F30 in [01-review-findings.md](../01-review-findings.md) is either
  covered by a regression test or explicitly noted in this slice's completion notes as
  intentionally untested (with reason).

## Completion notes

_(fill in when done)_
