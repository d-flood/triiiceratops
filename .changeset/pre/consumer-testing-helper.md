---
'triiiceratops': minor
---

add `createTestViewerHandle()` to `triiiceratops/testing`, so a React or Vue application can unit-test its own viewer-reading components without mounting a viewer.

Getting a `viewer` to hand a `<Sidebar>` previously meant mounting the real custom element — OpenSeadragon, a manifest fetch, and a shadow root — which pushed a unit-level concern into Playwright. The new helper returns a `ViewerHandle` backed by a **real** `ViewerState`: real commands, real batched notifications, and a real selector runtime registered in the very `WeakMap` `useViewerSelector()` consults, so the framework helpers work against it unchanged rather than against a parallel test-only path. Nothing about the state is faked; only the harness is (CONTEXT.md **Test viewer context**).

The returned handle is deliberately both shapes a framework helper accepts: it satisfies `ViewerHandleSlot`, so React passes it straight into `useViewer()` / `useViewerSelector()` where a `useViewerHandle()` slot would go, and it satisfies `ViewerHandle`, so Vue wraps it in a `shallowRef` where a template ref would go. `handle.element` is an inert, detached stand-in for the host — never connected, never upgraded, dispatching no viewer events — and it reports the handle's own state through `viewerState`, matching the invariant a mounted wrapper holds. `setOsdViewer()` injects a caller-supplied OpenSeadragon stand-in through the real readiness path, which is what makes `cadence: 'frame'` exercisable headlessly; no OSD fake ships here. `dispose()` is idempotent and removes the runtime's single underlying `ViewerState.subscribe`, so a test file creating many handles leaks nothing.

Nothing is registered, rendered, fetched, or required: no custom element is defined, no React, Vue, or Svelte specifier appears anywhere in the built entry's module graph, and a DOM is not needed to import it. `build:testing` now ends in `check:testing-entry`, which walks the real `dist/testing/index.js` graph and fails the build on a React, Vue, or Svelte specifier — the source legitimately imports `svelte`, and the guard is about what actually ships.
