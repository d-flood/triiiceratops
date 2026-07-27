# Lint / diagnostics allowlist

The quality gate is **zero warnings**: `eslint --max-warnings 0` and
`svelte-check --threshold warning` both run in required CI (ticket 22). This file
is the **only** sanctioned way to keep a specific diagnostic. Every entry must
carry:

- the **exact** diagnostic code,
- the **exact** file / target,
- a written **rationale**,
- a **behavior-test** reference proving the code is still correct,
- an **owner**,
- a **review date**.

Rules:

- **Wildcard / blanket suppressions are forbidden.** A bare `eslint-disable`
  (no rule names) fails lint via the local `local/no-blanket-eslint-disable`
  rule. `svelte-ignore` comments must name the exact code(s).
- Suppress at the **narrowest** scope: prefer an inline `svelte-ignore <code>`
  or a rule-named `eslint-disable-next-line <rule>` over a file- or project-wide
  setting. A project-wide `--compiler-warnings <code>:ignore` is allowed only
  when a per-line ignore is impossible (e.g. compiler directives) and only one
  file can emit the code.
- Generated code (`packages/core/src/lib/generated/`,
  `packages/core/src/lib/paraglide/`, `packages/core/src/paraglide/`) is
  excluded from eslint and prettier **via config**, and is not an entry here.

---

## Active suppressions

### 1. `options_missing_custom_element` — `packages/core/src/lib/components/TriiiceratopsViewerElement.svelte`

- **Code:** `options_missing_custom_element` (Svelte compiler)
- **Mechanism:** `--compiler-warnings "options_missing_custom_element:ignore"` on
  the core `check` script (project-wide; only this one file declares
  `<svelte:options customElement>`, and `svelte-ignore` does not apply to
  `<svelte:options>`).
- **Rationale:** svelte-check runs with `compilerOptions.customElement: false`
  so ordinary components are not analyzed as custom elements (that is what
  removed the ~18 `custom_element_props_identifier` warnings). This wrapper IS
  compiled as a custom element in the real element builds
  (`vite.config.element.ts` / `vite.config.element-esm.ts`, static
  `customElement: true`), where the `customElement` options are correct.
  svelte-check cannot apply per-file compiler options, so it emits this single
  false positive; the element itself is verified end-to-end.
- **Behavior test:** `packages/core/tests/wc-parity.spec.ts` — the
  `<triiiceratops-viewer>` custom element registers, renders a manifest inside
  its open shadow root, and its properties/events reach parity with the Svelte
  component.
- **Owner:** David Flood <david_flood@fas.harvard.edu>
- **Recorded:** 2026-07-18 · **Review by:** 2027-01-18

### 2. `a11y_interactive_supports_focus`, `a11y_click_events_have_key_events` — `packages/core/src/lib/components/ui/Select.svelte`

- **Codes:** `a11y_interactive_supports_focus`,
  `a11y_click_events_have_key_events` (Svelte compiler)
- **Mechanism:** two rule-named `<!-- svelte-ignore ... -->` comments on the
  `role="option"` element inside the listbox `{#each}`.
- **Rationale:** this is the ARIA combobox + `aria-activedescendant` pattern.
  The option elements are intentionally **not** individually focusable and carry
  **no** per-option keyboard handler: the combobox trigger (`role="combobox"`,
  `aria-activedescendant`, `onkeydown={onTriggerKeydown}`) owns all keyboard
  interaction, and the option's `onclick` is the pointer affordance only. Adding
  per-option `tabindex`/keyboard handlers would break the roving
  active-descendant model. False positive for this pattern.
- **Behavior test:** `packages/core/tests/a11y-keyboard.spec.ts` — "core Select
  (listbox) operates with keyboard and exposes aria-activedescendant".
- **Owner:** David Flood <david_flood@fas.harvard.edu>
- **Recorded:** 2026-07-18 · **Review by:** 2027-01-18
