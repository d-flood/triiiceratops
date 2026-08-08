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

### 3. bare `console.warn` — `packages/plugin-sdk/src/register.ts` (duplicate-registration notice)

- **Code:** bare `console.*` in `packages/plugin-*/src/**`, banned by the plugin
  distribution-cleanup guard (`distribution-cleanup.guard.test.ts`, ticket 28).
- **Mechanism:** a `// triiiceratops-console-allow` marker comment on the
  preceding lines (the guard's documented, narrowly-scoped allow marker) —
  anchored to this exact site, not a blanket exception.
- **Rationale:** `register()` runs at page-registration time, before any viewer
  or `ViewerConfig` exists, so there is no `viewererror`/`pluginerror` channel to
  route to. When a second copy of a plugin (a different version) registers on the
  same page, the first-registration-wins rule silently ignores the newcomer; a
  one-time `console.warn` is the only way to make that page-level
  misconfiguration visible to the integrator. Ticket 30 moved this warn from the
  four plugin packages into the single SDK `register.ts`, so it now exists once.
  Two further report-channel-first fallbacks carry the same marker and are
  covered by the same guard: `packages/plugin-sdk/src/activate.ts` (cleanup-phase
  fallback when the host supplied no `reportError`) and
  `packages/plugin-annotation-editor/src/AnnotationStore.svelte.ts` (persistence
  fallback when the host supplied no `onPersistenceError`).
- **Behavior test:** `packages/plugin-sdk/src/register.test.ts` — duplicate
  registration keeps the first factory and warns; the plugin
  `distribution-cleanup.guard.test.ts` suites prove every other console site is
  gone.
- **Owner:** David Flood <david_flood@fas.harvard.edu>
- **Recorded:** 2026-07-19 · **Review by:** 2027-01-19

### 4. Public-declaration `any` — IIIF resources crossing the raw-JSON boundary

- **Code:** public-`any` in emitted `.d.ts` (guarded by `scripts/check-public-api.mjs`)
- **File / target:** `api-reports/dts-any-allowlist.txt` — the machine-readable
  line list the gate reads. Each line is a normalized `any`-bearing public
  declaration (e.g. `manifestJson?: any` on the main `<TriiiceratopsViewer>`, plus
  the manifest / canvas / annotation accessors in `state/` and `utils/`, and the
  IIIF resource params on the image-download / pdf-export plugins).
- **Mechanism:** a single documented boundary, allowlisted per-line in the txt
  file rather than suppressed inline. The gate FAILS on any NEW public `any` that
  is not listed there.
- **Rationale:** the viewer hands out fetched IIIF resources (manifest / canvas /
  annotation) as the **raw JSON the publisher authored** — IIIF Presentation 2 or
  3 — and models that as `any`. These are STRUCTURAL exceptions at one boundary,
  not accidental leakage; narrowing them is a deliberate, recorded out-of-scope
  decision. The SDK ABI itself is `any`-clean. **Update protocol:** adding or
  removing a line requires
  regenerating the txt via `node scripts/check-public-api.mjs --write-allowlist`
  AND updating this entry's rationale/date in the same commit.
  **2026-07-31:** five lines were REMOVED (`dist/types/plugin.d.ts`'s
  `icon`/`panel`/`flyout`/`component` `Component<any>` fields). They were not
  IIIF-boundary `any`s at all — they were the Svelte-only `PluginDef` chrome
  path, deleted for 1.0 by framework-wrappers ticket 12. Nothing was added.
  **2026-07-31 (later):** ONE line was ADDED —
  `dist/framework/props.d.ts :: manifestJson?: string | Record<string, any>`.
  It is the same IIIF boundary as the already-listed
  `TriiiceratopsViewer.svelte.d.ts :: manifestJson?: any`, reached for the first
  time because framework-wrappers ticket 06 published `triiiceratops/react`,
  whose declaration graph includes the shared framework prop metadata. No new
  boundary and no new `any` — only a new public path to an existing one.
  **2026-07-31 (later still):** ONE further line was ADDED —
  `dist/vue/viewer.d.ts :: readonly type: PropType<string | Record<string, any>>`.
  Same IIIF boundary again, reached a third way: framework-wrappers ticket 07
  published `triiiceratops/vue`, whose `defineComponent` inlines the runtime
  prop declaration (including `manifestJson`'s `PropType`) into the emitted
  component type. The other eight lines that ticket added are NOT this boundary
  and are recorded separately in entry 6.
  **2026-08-07 (`remove-manifesto` ticket 09):** the boundary's ORIGINAL
  justification — "`manifesto.js` is untyped" — is retired with the dependency.
  The entry is **not** retired with it: the same `any`s remain, for a different
  and now first-party reason. Canvases, manifests and annotations crossing the
  public boundary are raw IIIF JSON in **either** Presentation version, and a v2
  resource and a v3 resource do not share a declarable shape (`@id`/`images[]`
  versus `id`/`items[]`). A typed `Canvas` interface is explicitly out of scope
  for this epic; when one lands, this entry shrinks. Net line changes:
  FOUR REMOVED — `manifests.svelte.d.ts :: manifesto?: any` and
  `getManifest(manifestId: string): any`, `viewer.svelte.d.ts :: get manifest():
any`, and `types/config/search.d.ts :: manifest: any` — all four being members
  that returned the removed library object. SIX ADDED, all in the new
  `dist/utils/iiifParsing.d.ts`: exporting `getPaintingAnnotations` from a public
  entry point makes its whole module reachable, and the declaration report is a
  file-level rollup, so its five module siblings are listed too even though no
  `exports` path imports them. FOUR REWRITTEN in place, all pre-existing lines
  whose signatures tightened in tickets 05–07 (`getCanvasChoices` and
  `getCanvases` now return `any[]` rather than `any`; `getCanvasLabel` gained
  `preferredLocale`) and one renamed (`search.d.ts :: manifest` →
  `manifestJson`).
- **Behavior test / gate:** `scripts/check-public-api.mjs` (run via
  `pnpm api:check` in required CI) — fails the build on any non-allowlisted
  public `any`.
- **Owner:** David Flood <david_flood@fas.harvard.edu>
- **Recorded:** 2026-07-19 · **Updated:** 2026-08-07 · **Review by:** 2027-01-19

### 5. `@ts-expect-error` (TS2307) — `packages/core/src/lib/framework/registration.ts`

- **Code:** `ts(2307)` "Cannot find module `../triiiceratops-element.js`",
  suppressed by a single inline `@ts-expect-error` with a description.
- **File / target:** the one dynamic `import('../triiiceratops-element.js')` in
  `createViewerElementRegistrar`'s default loader. Nothing else in the repo
  suppresses this code.
- **Mechanism:** inline `@ts-expect-error` — the narrowest possible scope, and
  self-invalidating: if the module ever becomes resolvable, TypeScript reports
  the unused directive and `pnpm --filter triiiceratops check` fails.
- **Rationale:** the framework substrate must load the SELF-CONTAINED element
  bundle by relative specifier, so a consumer's bundler resolves it inside the
  installed package with no self-reference and no export condition to configure.
  That artifact — `dist/triiiceratops-element.js` — is emitted by
  `build:element`, which runs AFTER the `build:lib` step that compiles this
  module, so it has no counterpart in `src/` and cannot be typed there.
  Alternatives were rejected: a hand-written `src/lib/triiiceratops-element.d.ts`
  shim would ship a misleading declaration next to a real artifact, and a
  non-literal specifier would make the import unanalyzable, so a consumer's
  bundler could not resolve it at all.
- **Behavior test / gate:** `packages/core/scripts/check-element-artifact.mjs`,
  appended to `build:element`, parses the built
  `dist/framework/registration.js`, requires it to still contain a relative
  dynamic import, and fails the build if the file that import resolves to is
  missing. `packages/core/src/lib/framework/registration.test.ts` covers the
  registrar itself through its injected `load` seam.
- **Owner:** David Flood <david_flood@fas.harvard.edu>
- **Recorded:** 2026-07-31 · **Review by:** 2027-01-31

### 6. Public-declaration `any` — Vue's own component typing in `triiiceratops/vue`

- **Code:** public-`any` in emitted `.d.ts` (guarded by `scripts/check-public-api.mjs`)
- **File / target:** eight lines in `api-reports/dts-any-allowlist.txt` under
  `dist/vue/viewer.d.ts` and `dist/vue/context.d.ts`:
    - the six derived emit-handler props
      (`onStateChange`, `onCanvasChange`, `onManifestChange`, `onChoiceChange`,
      `onPluginError`, `onViewerError`), each typed `(detail: …) => any`;
    - the trailing `…, true, {}, any>` type argument of the two `DefineComponent`
      types (`TriiiceratopsViewer`, `ViewerProvider`).
- **Mechanism:** allowlisted per-line in the same machine-readable txt file the
  gate reads. No inline suppression exists or is possible — these declarations
  are emitted by `tsc`, not written by hand.
- **Rationale:** every one of these `any`s originates inside Vue's own public
  type machinery and is not reachable from this repository's source. Vue's
  `EmitsToProps` maps an `ObjectEmitsOptions` entry to
  `(...args: P) => any` — the RETURN type is hard-coded `any` in
  `@vue/runtime-core`, while the PAYLOAD types are fully typed and are asserted
  by `packages/core/src/lib/vue/types.test.ts` (`EmitParams<'onPluginError'>` is
  exactly `[PluginError]`, and so on). The trailing `any` is likewise a fixed
  type argument of Vue's exported `DefineComponent` alias. Eliminating them
  would mean either hand-writing the component's declaration — which would
  desynchronize from the runtime `props`/`emits` objects Vue actually reads —
  or abandoning `defineComponent`, which the ticket's authoring constraint
  (plain `.ts`, `h()` + `defineComponent`, no `.vue` files) rules out. They are
  a single documented boundary at the Vue seam, exactly parallel to the
  raw-IIIF-JSON boundary in entry 4. **Update protocol:** same as entry 4 —
  regenerate the txt via `node scripts/check-public-api.mjs --write-allowlist`
  AND update this entry in the same commit.
- **Behavior test / gate:** `scripts/check-public-api.mjs` (run via
  `pnpm api:check` in required CI) — fails the build on any non-allowlisted
  public `any`. Payload typing is pinned by
  `packages/core/src/lib/vue/types.test.ts`, which `pnpm --filter triiiceratops check`
  runs through `tsc`.
- **Owner:** David Flood <david_flood@fas.harvard.edu>
- **Recorded:** 2026-07-31 · **Review by:** 2027-01-31

### 7. `a11y_no_noninteractive_tabindex`, `a11y_no_noninteractive_element_interactions` — `packages/core/src/lib/components/CanvasHost.svelte`

- **Codes:** `a11y_no_noninteractive_tabindex`,
  `a11y_no_noninteractive_element_interactions` (Svelte compiler)
- **Mechanism:** two rule-named `<!-- svelte-ignore ... -->` comments on the
  Canvas2D renderer's root element — the focusable image surface. Both are
  **element-scoped**: a `svelte-ignore` comment suppresses only the rules it
  names, and only on the single element that immediately follows it. Nothing
  else in this component, and no other component, loses either check — which is
  the strongest argument for taking the suppression this narrowly rather than
  disabling the rules in `eslint.config.js` or the Svelte compiler options.
- **Rationale:** the image surface is a focusable pan/zoom widget
  (`tabindex="0"`, `role="application"`, `aria-label`, a visible `:focus-visible`
  ring, and `keydown`/`keyup` handlers). Svelte's heuristic classifies every ARIA
  role outside the widget set as non-interactive, and `application` — whose
  entire purpose is to declare that this element handles its own keys, so
  assistive technology passes arrows through rather than using them to browse —
  is one of them. No role both describes a pan/zoom surface honestly and
  satisfies the heuristic (`region`, `group`, and `img` are non-interactive too),
  and the affordances the two rules exist to demand are all present. The focus
  target is the wrapper rather than the `<canvas>` because a canvas is
  interactive content in its own right, so a widget role on it is a
  contradiction — the same canvas-paints / DOM-carries-the-targets split the
  renderer spec draws for overlays.
- **Constraint this creates:** `role="application"` suppresses browse mode for
  the element's whole **subtree**, not just the element. Today the only child is
  the `<canvas>`, which has nothing to browse. Any future non-canvas descendant
  — ticket 12's per-canvas error UI and ticket 14's annotation overlay are both
  slated to land inside `.renderer-root` — must either carry `role="document"`
  (restoring browse mode for its own subtree) or be hoisted out and rendered as
  a sibling; otherwise its text becomes unreadable to NVDA and JAWS users. The
  role itself stays: it is the only one those screen readers pass arrow keys
  through, which is what makes the surface operable at all. Noted in the markup
  comment above the element.
- **Behavior test:** `packages/core/tests/a11y-keyboard.spec.ts` — the
  "Canvas2D renderer — keyboard" journeys: tab reachability, accessible name,
  the two-tone focus ring asserted by width and by both resolved token colours,
  held-arrow panning at a steady rate, Shift+arrow panning further (with Shift
  pressed second and released first), momentum carrying onward on release, a
  hold ending on blur and under the key-swallowing Meta modifier, `+`/`-` zoom
  (including that a held `+` does not compound per OS key repeat), `0`/`Home`
  fit, and bindings not firing when the surface is unfocused. Reduced-motion
  stepping — one step per deliberate press, none per repeat — is in
  `packages/core/tests/a11y-reduced-motion.spec.ts`. Plus
  `packages/core/tests/a11y-axe.spec.ts` scanning the viewer with the new tab
  stop present.
- **Owner:** David Flood <david_flood@fas.harvard.edu>
- **Recorded:** 2026-08-07 · **Review by:** 2027-02-07
