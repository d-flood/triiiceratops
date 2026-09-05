---
'triiiceratops': minor
---

Add the React 19 framework wrapper at `triiiceratops/react`. A React application
now renders `<TriiiceratopsViewer>` with typed props for every viewer input
(including `searchProvider`), creates a handle with `useViewerHandle()`, reads
live viewer state with `useViewer()` and `useViewerSelector()`, receives typed
callbacks (`onStateChange`, `onCanvasChange`, `onManifestChange`,
`onChoiceChange`, `onPluginError`, `onViewerError`) carrying the event detail
directly, and gets a `ViewerHandle` through a forwarded ref — with no Svelte
installed at runtime or at type-check time, no JSX build changes, and no manual
custom-element setup. Registration of the self-contained element is automatic,
lazy, and shared across every wrapper instance.

The wrapper renders exactly one custom element and no layout wrapper. The
attribute tier (`manifestId`, `canvasId`, `theme`) is rendered declaratively so
a server render and the client's first render emit the same host; the property
tier is applied imperatively and edge-triggered, so re-rendering with unchanged
values never reloads a manifest, snaps the viewport, or restarts a plugin.
`manifestId` and `canvasId` are uncontrolled inputs. `useViewerSelector` is
built on `useSyncExternalStore` (hand-rolled — `use-sync-external-store` is not
a dependency), supports inline projections and inline equality with no
`useCallback` or `useMemo`, offers `state` and `frame` cadences, and surfaces a
consumer's own projection failures through React error boundaries.
`getServerSnapshot` is deliberately omitted, so a state-reading component
rendered on the server fails loudly instead of hydrating from a fabricated
snapshot.

React 19 is an optional peer dependency.
