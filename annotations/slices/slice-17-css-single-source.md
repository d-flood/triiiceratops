# Slice 17 — Annotorious CSS single-source

- **Phase:** 5 (Hardening)
- **Status:** not started
- **Depends on:** slice-12 (point CSS settled first, to avoid churn)
- **Findings:** F23
- **Plan reference:** [02-implementation-plan.md](../02-implementation-plan.md) §5

## Goal

One source of truth for Annotorious CSS. Today the manager injects a vendored,
minified copy of the whole stylesheet (with version-specific hashed class names like
`svelte-g4ws1v`) **and** the panel side-effect-imports the real CSS file — the vendored
copy silently breaks on any `@annotorious/*` upgrade.

## Files

- `src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts` (`injectStyles`)
- `src/lib/plugins/annotation-editor/AnnotationEditorPanel.svelte` (remove the import)
- possibly `vite.config.lib.ts` / `vite.config.plugins-iife.ts` (verify `?inline`
  handling in both builds)

## Implementation

1. In the manager:

   ```ts
   import annotoriousCss from '@annotorious/openseadragon/annotorious-openseadragon.css?inline';
   ```

   `injectStyles` injects `annotoriousCss + PLUGIN_FIX_CSS` (the plugin's own overrides
   block stays inline as today, minus anything slice-12 already removed). Delete the
   vendored minified string.
2. Remove the side-effect CSS import from the panel — the manager's injection is the
   single path, and it is shadow-root aware (the element build requires injection into
   the shadow root; a `<link>`/document-head-only approach cannot work there — same
   constraint class as the existing `emitCss: false` element-build handling).
3. Verify `?inline` resolves in **all** build targets: `pnpm build:lib`,
   `pnpm build:element`, `pnpm build:plugins-iife` (the IIFE plugin build must bundle
   the CSS string, not emit a file). Adjust vite configs if any target mishandles it.
4. Keep the injection idempotent per root (`getElementById(styleId)` guard, as today).

## Tests

- Unit: `injectStyles` injects exactly one `<style>` per root; repeated calls don't
  duplicate; ShadowRoot and Document paths both covered (jsdom).

## Acceptance

- `pnpm build:lib && pnpm build:element && pnpm build:plugins-iife` all succeed;
  `pnpm check:runtime-deps` passes.
- Manual: annotation drawing looks correct in (a) the Svelte demo (`pnpm dev`) and
  (b) the web-component demo (shadow DOM) — selection handles, drawing layer, and point
  markers all styled.
- `grep -c 'a9s-gl-canvas' src/lib/plugins/annotation-editor/AnnotationManager.svelte.ts`
  returns 0 (vendored copy gone).

## Completion notes

_(fill in when done)_
