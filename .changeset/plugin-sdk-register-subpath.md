---
'@triiiceratops/plugin-sdk': minor
---

Add a `@triiiceratops/plugin-sdk/register` subpath exporting `registerBrowserPlugin`, the self-contained helper that bootstraps the `window.Triiiceratops` namespace and registers a plugin factory into it (order-independent, first-registration-wins, never activates). The module imports only an erased type, so plugin IIFEs still bundle it cheaply with no SDK runtime or Svelte pulled in. The four first-party plugins now consume this single shared implementation instead of each carrying a byte-identical copy of the registration logic; runtime behavior (registration semantics and the duplicate-registration warning) is unchanged.
