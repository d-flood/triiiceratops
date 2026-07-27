---
'@triiiceratops/plugin-sdk': minor
---

Add a core-owned-chrome activation path for SDK plugins, then complete the migration onto it as the only path: the legacy self-render path and the transitional `__coreChrome` marker on `SdkPluginMeta`/`definePlugin` are removed, and `dismiss` (`'light' | 'explicit'`, default `'light'`) declares whether an outside pointer-down closes a flyout.

Add `definePluginStyles(css, id)` to the entry — a dependency-free helper that shapes a plugin's global stylesheet and its style-service install id into the `{ STYLES, STYLE_ID }` pair `context.styles.install(STYLES, STYLE_ID)` consumes, carrying the shared root-aware-install contract in one place. Also add a `@triiiceratops/plugin-sdk/register` subpath exporting `registerBrowserPlugin`, the self-contained helper that bootstraps the `window.Triiiceratops` namespace and registers a plugin factory into it (order-independent, first-registration-wins, never activates). Both helpers import nothing beyond erased types, so plugin IIFEs still bundle them with no SDK runtime or Svelte pulled in. The four first-party plugins now consume these shared implementations instead of each carrying byte-identical copies; runtime behavior is unchanged.
