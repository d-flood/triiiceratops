---
search:
  exclude: true
---

# `ViewerState` is the sole integration-facing state surface

Plugins and framework wrappers receive one live object — the per-viewer `ViewerState` —
and reach everything through it: manifest and canvas data, annotations, chrome state,
the viewport. Framework wrappers translate that same object into framework-native
selectors; they do not own a parallel state surface. The page-shared manifest cache
(`manifestsState`) stays an internal caching optimization reached only via `ViewerState`
queries and subscriptions, and plugin-written display state (`userAnnotations`) moves
out of it into per-viewer state. The alternative — documenting the cache or a
framework-specific store as another contract surface — was rejected because it doubles
the inventory/subscription work, freezes internal shapes as public API, and (via
`userAnnotations`) leaks plugin state between viewers on one page. Every mutable member
is classified in a checked-in state inventory as command state, observable state, or
internal, with command coverage set by the parity rule: anything the viewer's own UI
can do, an integration can do through a supported command. The object is deliberately
not sealed — direct assignment stays physically possible as an unsupported escape hatch
for trusted code, with no semver or invariant guarantees.
