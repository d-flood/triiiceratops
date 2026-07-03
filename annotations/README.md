# Annotation Editor Plugin — Review, Plan, and Progress Tracker

This directory contains a full review of `src/lib/plugins/annotation-editor/`
(2026-07-03), an implementation plan, and the plan broken into 18 executable slices.
**This README is the tracker: agents update the table below as work completes.**

Product goals driving everything here:

1. Consumers can bring their own annotation-server adapter without the adapter being
   significant — the plugin handles display sync, ids, stamping, caching, and errors.
2. The point tool creates (and the viewer renders) true IIIF `PointSelector` points.
3. The plugin is configurable per project — e.g. point-tool-only with a custom widget
   for complex annotation bodies.

## Documents

- [01-review-findings.md](./01-review-findings.md) — 30 findings (`F1`–`F30`) with
  file:line references, plus what already works and must be preserved.
- [02-implementation-plan.md](./02-implementation-plan.md) — the narrative plan
  (background and rationale; slices reference its sections).
- [slices/](./slices/) — one file per slice: goal, files, steps, tests, acceptance
  criteria, and a status field.

## Agent bootstrap — read this, then continue

You are implementing this plan one slice at a time. Protocol:

1. **Orient.** Read this README fully. Skim
   [01-review-findings.md](./01-review-findings.md) (you'll deep-read the findings your
   slice references). Do not re-review the plugin from scratch — the review is done.
2. **Pick the next slice.** Take the first row in the tracker whose status is
   `not started` and whose *Depends on* slices are all `done`. If a slice is
   `in progress`, resume it instead (read its Completion notes and the work log for
   where it stopped). If a slice is `blocked`, skip it and take the next eligible one.
3. **Mark it.** Set the slice's status to `in progress` in **both** the tracker table
   below and the slice file header, before writing code.
4. **Read, then implement.** Read the slice file end-to-end, the findings it references,
   and the plan section it cites. Read the actual source files before editing — line
   numbers in the findings drift as slices land. Follow the slice's steps; if reality
   contradicts the slice (code moved, an approach doesn't work), prefer reality, do the
   minimal sensible adaptation, and record the deviation in the slice's Completion
   notes. If the deviation invalidates a *later* slice's assumptions, add a note to that
   slice's file too.
5. **Verify.** Minimum bar for every slice (slices may add more):
   - `pnpm exec vitest run src/lib/plugins/annotation-editor` (note: bare `pnpm test`
     starts vitest in watch mode — don't use it)
   - `pnpm exec vitest run` (full suite) before marking done
   - `pnpm check` (svelte-check + tsc) and `pnpm lint`
6. **Mark it down.** Update the slice file: status → `done (YYYY-MM-DD)` and fill in
   Completion notes (what changed, deviations, follow-ups). Update the tracker row
   below. Append a row to the work log at the bottom of this file.
7. **Commit.** One commit per completed slice containing only the files the slice
   touched plus this directory's tracker updates. Message:
   `annotation-editor: slice NN — <title>`. Do not commit unrelated dirty files that
   were already modified in the working tree when you started.
8. **Continue or stop.** If the slice completed cleanly, you may proceed to the next
   eligible slice. Stop and report instead when: a slice is blocked on a decision not
   covered by the Decisions section below, verification fails in a way the slice
   doesn't anticipate, or you'd be starting a large slice with little context window
   left (finish cleanly rather than leave a slice half-done — `in progress` with good
   notes is acceptable, half-edited code without notes is not).

Useful context for implementers:

- Repo uses **pnpm**. Dev demo: `pnpm dev`. E2E: `pnpm test:e2e` (only where a slice
  asks). Library build: `pnpm build:lib`; element build: `pnpm build:element`;
  IIFE plugins: `pnpm build:plugins-iife`.
- i18n is paraglide: message keys live in `messages/en.json` and `messages/de.json`;
  UI strings go through `m.*` — never hardcode.
- The element (web component) build renders in shadow DOM — CSS must be injected into
  the root node, not assumed to come from document `<head>`.
- Annotorious v3 (`@annotorious/openseadragon@^3.7`) — v2 APIs (`formatter`,
  `readOnly` flags, etc.) do not exist; verify against `node_modules` when unsure.

## Decisions (already made — don't re-litigate, but flag if a slice proves one wrong)

| # | Decision |
|---|---|
| D1 | Undo/redo: remove the Annotorious-backed UI in slice-04; rebuild persistence-aware in slice-09. |
| D2 | Point coordinates round to **integer canvas pixels** (matches IIIF cookbook usage). |
| D3 | Keep a read-compat path for legacy fragment-rect "points" for one release; new writes are always `PointSelector`. |
| D4 | The built-in body editor renders unknown/structured body shapes read-only and never drops them on save. |

## Progress tracker

Statuses: `not started` · `in progress` · `done (date)` · `blocked: <reason>`

| Slice | Phase | Title | Findings | Depends on | Status |
|---|---|---|---|---|---|
| [01](./slices/slice-01-target-source.md) | 1 | `target.source` correctness | F1, F26 | — | done (2026-07-03) |
| [02](./slices/slice-02-persistence-flow.md) | 1 | Persistence flow: drafts, single save, race token | F2, F3, F4, F14 | 01 | not started |
| [03](./slices/slice-03-hydration-and-tools.md) | 1 | Internal hydration state + tool config | F7, F8, F19 | 02 | not started |
| [04](./slices/slice-04-lifecycle-ux-cleanup.md) | 1 | Lifecycle & UX cleanup | F6, F9*, F11, F12, F13, F22, F24, F25, F27 | 02 | not started |
| [05](./slices/slice-05-annotation-store.md) | 2 | Extract `AnnotationStore` (refactor) | — | 01–04 | not started |
| [06](./slices/slice-06-display-sync.md) | 2 | Plugin-owned display sync | F10, F11 | 05 | not started |
| [07](./slices/slice-07-server-ids-stamping.md) | 2 | Server-assigned IDs + stamping | F5, F18 | 05, 06 | not started |
| [08](./slices/slice-08-error-surface.md) | 2 | Error surface, rollback, feedback | F20 | 05–07 | not started |
| [09](./slices/slice-09-undo-redo.md) | 2 | Persistence-aware undo/redo | F6 | 08 | not started |
| [10](./slices/slice-10-adapter-kit.md) | 2 | Adapter conformance kit + docs | F28* | 06, 07 | not started |
| [11](./slices/slice-11-pointselector-authoring.md) | 3 | Direct `PointSelector` authoring | F17, F18* | 07 | not started |
| [12](./slices/slice-12-point-editing-rendering.md) | 3 | Point editing & rendering | F9, F30* | 11 | not started |
| [13](./slices/slice-13-custom-body-editor.md) | 4 | Custom body editor | F29 | 05, 08 | not started |
| [14](./slices/slice-14-ui-knobs-flyout.md) | 4 | UI knobs + flyout target | F30 | 03, 13 | not started |
| [15](./slices/slice-15-reactivity-scoped-events.md) | 4 | Reactive extension + scoped events | F15, F16 | 04 | not started |
| [16](./slices/slice-16-types-cleanup.md) | 4 | Public types cleanup | F21 | 07, 13 | not started |
| [17](./slices/slice-17-css-single-source.md) | 5 | Annotorious CSS single-source | F23 | 12 | not started |
| [18](./slices/slice-18-tests-docs-migration.md) | 5 | Tests, docs rewrite, migration notes | F28 | all | not started |

\* = partial coverage of that finding in this slice (the finding completes elsewhere).

**Milestones:** slices 01–04 make current behavior correct (shippable alone);
01–10 deliver the minimal-adapter goal; 11–12 deliver IIIF points; 13–16 deliver the
point-only + custom-body project configuration; 17–18 harden and document.

## Headline findings (context for anyone skimming)

- `target.source` is stamped with the canvas open at init — annotations created after
  canvas navigation persist with the wrong target (F1).
- `extension.prepareDraft` enrichment is shown in the UI but never persisted on create
  (F2); body saves persist twice (F3); every save does a full `adapter.load()` (F4).
- Custom adapters written per the current docs persist fine but **display nothing** —
  display injection lives inside `LocalStorageAdapter` instead of the plugin (F10).
- Adapters cannot return server-assigned annotation IDs (F5); the lazy-hydration flag
  is dropped by Annotorious, so skeleton bodies can overwrite full ones on save (F7).
- `config.tools: ['point']` still activates the rectangle tool (F8); the `formatter`
  option is dead v2 API so points render as squares while editing (F9).

## Work log

_Append one row per completed (or halted) slice — newest last._

| Date | Slice | Agent notes |
|---|---|---|
| 2026-07-03 | 01 | `forceTargetSource` always overwrites `target.source` with the current canvas id; dropped all `'unknown'` fallbacks; null-canvas guards in `handlePointClick`/`updateDrawingMode`. +3 regression tests. Full suite 320 pass, `check` clean. Pre-existing lint error in `ui/Select.svelte` left untouched. Manual localStorage inspection not done in headless run. |
