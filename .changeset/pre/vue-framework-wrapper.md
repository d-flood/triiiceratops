---
'triiiceratops': minor
---

Add the Vue 3.5 framework wrapper at `triiiceratops/vue`. A Vue application now
renders `<TriiiceratopsViewer>` with typed props for every viewer input
(including `searchProvider`), puts an ordinary template ref on it to get the
`ViewerHandle` shape (`viewer.value?.state`), reads live viewer state with
`useViewer()` and `useViewerSelector()`, and receives typed emits
(`state-change`, `canvas-change`, `manifest-change`, `choice-change`,
`plugin-error`, `viewer-error`) carrying the event detail directly — with no
Svelte installed at runtime or at type-check time, no `.vue` compilation of the
wrapper, and no manual custom-element setup. Because the component is a render
function, no `compilerOptions.isCustomElement` configuration is required.
Registration of the self-contained element is automatic, lazy, and shared across
every wrapper instance.

The wrapper renders exactly one custom element and no layout wrapper.
`inheritAttrs` is disabled and `attrs` are forwarded deliberately. The attribute
tier (`manifestId`, `canvasId`, `theme`) is rendered declaratively as
force-attribute vnode props, so a server render and the client's first render
emit the same host; the property tier goes through the shared edge-triggered
applier rather than vnode props, so object- and function-valued inputs are never
stringified by `setAttribute` and re-rendering with unchanged values never
reloads a manifest, snaps the viewport, or restarts a plugin. `manifestId` and
`canvasId` are uncontrolled inputs and no `v-model` is offered.

`provideViewer(handleRef)` and `<ViewerProvider :value="handleRef">` distribute
the handle to deep trees. `useViewerSelector` is a `computed` that reads both the
handle and the runtime's notification version in its own body: Vue reactive
dependencies read by a projection are tracked with no manual watcher, a
`<KeepAlive>` round trip rebinds every composable to the new `ViewerState`, and a
failing projection or equality function throws during the consumer's own
evaluation so it reaches `onErrorCaptured` and `app.config.errorHandler` instead
of being swallowed, mislabelled, or served as a stale value. Both `state` and
`frame` cadences are supported.

Vue 3.5 is an optional peer dependency.
