---
'@triiiceratops/plugin-sdk': minor
---

Add `definePluginStyles(css, id)` to the `@triiiceratops/plugin-sdk` entry — a dependency-free helper that shapes a plugin's global stylesheet and its style-service install id into the `{ STYLES, STYLE_ID }` pair `context.styles.install(STYLES, STYLE_ID)` consumes. It carries the shared root-aware-install contract (previously repeated near-verbatim as a doc comment across every plugin's `styles.ts`) in one place and imports nothing, so plugin IIFEs still bundle it with no SDK runtime or Svelte pulled in. The four first-party plugins now build their `STYLES` / `STYLE_ID` exports through this helper; the exported string values and runtime behavior are unchanged.
