# Tracker for framework-wrappers

## Purpose

This document tracks the work required to publish idiomatic React and Vue framework
wrappers over the Triiiceratops custom element and its shared viewer state contract, so
that each framework's consumers get access that feels native to their framework without
installing Svelte at runtime or at type-check time.

## Current Status

Overall status: `Not Started`

Current ticket: None

Last updated: 2026-07-31

## Ledger

| Number | Filename                                        | Status      | Depends On     |
| ------ | ----------------------------------------------- | ----------- | -------------- |
| 01     | `01-generalize-selector-runtime.md`             | Not Started | None           |
| 02     | `02-custom-element-state-bridge.md`             | Not Started | None           |
| 03     | `03-remove-svelte-types-from-public-surface.md` | Not Started | None           |
| 04     | `04-identity-keyed-plugin-activation.md`        | Not Started | None           |
| 05     | `05-framework-wrapper-substrate.md`             | Not Started | 01, 02, 03     |
| 06     | `06-react-framework-wrapper.md`                 | Not Started | 05             |
| 07     | `07-vue-framework-wrapper.md`                   | Not Started | 05             |
| 08     | `08-consumer-testing-helper.md`                 | Not Started | 06, 07         |
| 09     | `09-packed-framework-consumers.md`              | Not Started | 04, 06, 07, 08 |
| 10     | `10-public-api-release.md`                      | Not Started | 09             |
| 11     | `11-framework-wrapper-docs.md`                  | Not Started | 06, 07, 08     |

## Notes

Tickets 01 through 04 have no dependencies and are each independently shippable:

- 01 generalizes the selector runtime into core and adds selector cadence (ADR 0011).
- 02 completes the custom element's state bridge and `searchProvider` as a low-level feature.
- 03 removes Svelte from core's published type surface — a prerequisite for the promise that
  framework consumers never need Svelte, and a standalone correctness fix.
- 04 fixes a pre-existing core defect: plugin activation lifetime was keyed to the identity of
  the plugins array rather than to plugin identity, so any host re-evaluating its list per
  render restarted every plugin.

Tickets 06 and 07 can proceed in parallel once 05 lands.

The numbering changed when this plan was revised; ticket numbers do not correspond to those in
earlier drafts (for example, the React wrapper moved from 04 to 06).
