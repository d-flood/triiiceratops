## Problem Statement

React and Vue applications can currently use Triiiceratops only by treating it as a
low-level custom element. Consumers must register the element, declare or configure the
custom tag for their framework, assign object-valued properties through refs, install
and remove DOM event listeners, and manually translate state snapshots into framework
reactivity. The event snapshots expose only part of viewer state and provide no command
surface. This is cumbersome, easy to get wrong during lifecycle changes, and especially
awkward in applications with SSR or more than one viewer.

Consumers should be able to import Triiiceratops as an idiomatic React or Vue component
without installing Svelte or changing their Vite pipeline. Reading state, invoking
commands, wiring events, and unit-testing their own components should all feel like the
viewer was written in their framework — not like a web component bolted into their app.
They should reach all of it through the existing per-viewer `ViewerState`, without a
second framework-specific state surface.

Two things are deliberately outside that promise: consumers cannot restyle the viewer's
shadow-DOM internals beyond theme tokens, and they cannot compose viewer chrome from
their own framework components. Idiomatic _access_ to the custom element is the boundary
of this work.

## Solution

Publish thin React 19 and Vue 3.5 framework wrappers from `triiiceratops/react` and
`triiiceratops/vue`. Each framework wrapper hosts the existing Triiiceratops custom
element, translates its lifecycle, properties, events, and viewer state into the
framework's idioms, and never implements or owns a second viewer.

The wrappers automatically and lazily register the self-contained custom element in the
browser. They are safe to import during SSR and emit an inert custom-element host on the
server; viewer internals initialize only after client hydration. The custom element
exposes its actual per-instance `ViewerState` through a supported, getter-only state
bridge that doubles as the wrappers' version handshake.

Consumers create a viewer handle, pass it to the component, and read through it. React
uses `useViewerHandle()` plus a `handle` prop; Vue uses an ordinary template ref. In both
frameworks the helpers take that handle, so application UI can live anywhere in the tree
with no layout constraints. Reads are nullable until the viewer's state exists, which is
the honest state of the world and each framework's normal shape for "not ready yet".
`useViewerSelector` is one generic, equality-gated, memoized projection whose _cadence_
selects which notification wakes it, so batched member changes and continuous OSD
viewport values are both reactively readable through the same helper. Typed framework
callbacks and emits replace manual DOM listeners, and a small `ViewerHandle` remains the
imperative escape hatch.

## User Stories

### Packaging and installation

1. As a React application developer, I want to import a typed viewer component from `triiiceratops/react`, so that I do not have to integrate a custom element manually.
2. As a Vue application developer, I want to import a typed viewer component from `triiiceratops/vue`, so that I do not have to configure Vue to recognize the custom-element tag.
3. As a React application developer, I want the package to work with React 19, so that it matches the framework version supported by the existing plugin SDK adapter.
4. As a Vue application developer, I want the package to work with Vue 3.5, so that it matches the framework version supported by the existing plugin SDK adapter.
5. As a framework consumer, I want React and Vue to remain optional peer dependencies, so that installing Triiiceratops for another integration does not install an unused framework.
6. As a framework consumer, I want the wrapper to use the self-contained custom element, so that there remains only one viewer implementation.
7. As a framework consumer, I want Svelte and its runtime bundled behind the custom-element boundary, so that I do not install Svelte to run the viewer.
8. As a framework consumer, I want the published type declarations to resolve with no Svelte package installed, so that Svelte is not a type-time requirement either.
9. As a Vite application developer, I want precompiled framework entry points, so that I do not add a Svelte plugin or alter my compilation pipeline.
10. As a framework consumer, I want custom-element registration to happen automatically, so that I do not add a side-effect registration import.
11. As a developer with multiple wrapper instances, I want automatic registration shared across instances, so that every instance does not repeat browser-global setup.

### Server rendering

12. As an SSR application developer, I want importing a framework entry point to be safe when `window` and `customElements` do not exist, so that server evaluation does not fail.
13. As an SSR application developer, I want the server to emit an inert viewer host with serializable attributes and forwarded styling, so that hydration preserves the host and layout hooks.
14. As an SSR application developer, I want viewer internals to initialize only in the browser, so that browser-only dependencies never execute on the server.
15. As an SSR application developer, I want the client's first render to emit the same attributes the server did, so that hydration reports no mismatch.

### Configuring the viewer

16. As a React application developer, I want `manifestId`, `canvasId`, `manifestJson`, `plugins`, `theme`, `themeConfig`, `config`, `initialCanvasRegion`, and `searchProvider` to be typed component props, so that I can configure the viewer without refs.
17. As a Vue application developer, I want the same viewer inputs to be typed component props, so that templates and setup code receive editor and compiler assistance.
18. As a host using custom search, I want `searchProvider` available through the custom element and both wrappers, so that framework integrations have feature parity with the native viewer.
19. As a framework consumer, I want object-valued and function-valued inputs to reach the element as JavaScript properties in every case, so that values are never stringified into attributes because registration had not finished.
20. As a framework consumer, I want prop changes forwarded after mount, so that parent state can direct the live viewer.
21. As a framework consumer, I want an unchanged prop value to write nothing to the element, so that a parent re-render never reloads my manifest, snaps my viewport, or restarts my plugins.
22. As a framework consumer, I want `manifestId` and `canvasId` to behave like uncontrolled inputs — my value is an instruction, not a continuously enforced binding — so that the wrapper never fights the user's own navigation.
23. As a framework consumer, I want internal navigation observed through selectors or callbacks, so that my application can synchronize when it chooses without stale values being pushed back automatically.
24. As a React application developer, I want standard `className`, `style`, `id`, `data-*`, `aria-*`, and ordinary DOM attributes forwarded to the viewer host, so that I can style, identify, and instrument it normally.
25. As a Vue application developer, I want ordinary attributes and listeners handled explicitly despite the wrapper's single-element rendering, so that Vue attribute inheritance remains predictable.
26. As a framework consumer, I want no extra layout element around the custom element, so that adopting the wrapper does not change viewer sizing or CSS behavior.

### Reaching viewer state

27. As a framework consumer, I want the custom element to expose its actual per-instance `ViewerState`, so that wrappers do not invent an incomplete state API.
28. As a framework consumer, I want a race-free signal when viewer state becomes available, so that a wrapper works whether registration happens before or after connection.
29. As a framework consumer, I want each handle bound to only its owning viewer state, so that multiple viewers on one page remain isolated.
30. As a React application developer, I want to create a viewer handle with a hook and pass it to the component, so that the pattern matches how I already consume `useForm`-style APIs.
31. As a Vue application developer, I want an ordinary template ref to be the viewer handle, so that the pattern matches `useTemplateRef` and every VueUse composable I already use.
32. As a framework consumer, I want to place my own UI anywhere relative to the viewer — before it, after it, nested inside my own layout boxes — without the wrapper constraining my markup.
33. As a framework consumer, I want to distribute the handle to deep components through my framework's own mechanism, so that I do not thread props through every intermediate component.
34. As a framework consumer, I want reads to report plainly that the viewer is not ready yet, so that I handle it the way I handle any other asynchronous resource.
35. As a framework consumer, I want a clear development warning if I create a handle and never pass it to a viewer, so that the most likely wiring mistake is named instead of silent.
36. As a framework consumer, I want a prompt error if I pass one handle to two viewers, so that ambiguous ownership never silently breaks per-viewer isolation.
37. As a framework consumer, I want `useViewer()` to return a typed, readonly view of `ViewerState` that omits lifecycle plumbing, so that supported commands are discoverable and destructive internals are not offered by autocomplete.

### Reactive reads

38. As a framework consumer, I want `useViewerSelector()` to infer the selected value's type, so that reactive state access is concise and type safe.
39. As a framework consumer, I want selector equality to default to `Object.is`, so that unchanged selections do not trigger framework updates.
40. As a React application developer, I want inline selectors and current equality functions to work without `useCallback` or `useMemo`, so that the helper is idiomatic under React 19 and React Compiler.
41. As a React application developer, I want selector reads to stay correct under concurrent rendering and Strict Mode, so that I see no tearing and no repeated-render warnings.
42. As a Vue application developer, I want selector projections to update for viewer notifications and for Vue reactive dependencies read by the projection, so that I do not add manual watchers.
43. As a framework consumer, I want to read continuous viewport values such as zoom and pan reactively by choosing a frame cadence, so that animated state is available without a separate API and without per-frame notifications for everyone else.
44. As a framework consumer, I want an idle viewer to cost nothing for frame-cadence support, so that offering it does not add a background loop.
45. As a framework consumer, I want a development warning when a batched-cadence projection reads through `osd`, so that a selector that would silently appear frozen tells me the fix.
46. As a framework consumer, I want all selectors for one viewer to fan out from one underlying viewer-state subscription, so that adding consumer components does not multiply core subscriptions unnecessarily.
47. As a framework consumer, I want consumer selector failures to surface through my framework's native error handling, so that application errors are neither swallowed nor mislabeled as viewer or plugin failures, and never returned as a stale value.
48. As a plugin author, I want existing plugin SDK selector imports and call signatures to remain valid, so that generalizing selector machinery does not break plugins.
49. As a plugin author, I want selector failures to retain plugin-specific attribution, so that `pluginerror` continues to identify command and subscription phases correctly.

### Events and imperative access

50. As a React application developer, I want typed callback props for state, canvas, manifest, choice, plugin-error, and viewer-error channels, so that I do not install DOM listeners.
51. As a Vue application developer, I want typed emits for the same channels, so that template handlers receive semantic payloads without raw `CustomEvent` handling.
52. As a framework consumer, I want callbacks and emits to receive event detail directly, so that application code is independent of DOM event envelopes.
53. As a host handling plugin failures, I want the original `PluginError` object including `retry()` preserved, so that framework translation does not remove recovery behavior.
54. As a host handling viewer failures, I want the original typed `ViewerError` preserved, so that errors can be reported and presented consistently.
55. As a React application developer, I want a typed imperative ref, so that tests and integrations can access the underlying element and viewer state when hooks are unsuitable.
56. As a Vue application developer, I want the equivalent typed template ref, so that both frameworks expose the same escape hatch.
57. As a framework consumer, I want the imperative handle to expose only the element and readonly state, so that the escape hatch stays small and discoverable.

### Lifecycle

58. As a framework consumer, I want unmounting to remove DOM listeners and dispose the selector runtime, so that remounts and route changes do not leak work.
59. As a framework consumer, I want handles and bindings invalidated during unmount, so that detached viewer state is not accidentally reused.
60. As a developer using hot module replacement or strict lifecycle checks, I want registration and teardown to be idempotent, so that development behavior does not duplicate viewers or subscriptions.
61. As a Vue application developer using `<KeepAlive>`, I want the wrapper to rebind cleanly when the element is detached and later reattached, so that selectors, commands, and handles keep working after reactivation.
62. As a Vue application developer using `<KeepAlive>`, I want the resulting viewer-state loss documented and warned about in development, so that I am not surprised that canvas and zoom did not survive deactivation.
63. As a developer on a page with a pre-registered incompatible element, I want the wrapper to fail fast with a clear version-conflict error, so that it does not wait forever for an unsupported state bridge.

### Plugins

64. As a framework consumer, I want to pass framework-neutral SDK plugins to the viewer, so that plugin support does not require Svelte types or a Svelte runtime in my application.
65. As a framework consumer, I want re-supplying an equal plugin list to leave running plugins untouched, so that a parent re-render does not tear down and restart every plugin.

### Testing my own application

66. As a framework consumer, I want to construct a viewer handle backed by real viewer state with no DOM, so that I can unit-test my own components that read selectors and invoke commands.
67. As a framework consumer, I want that helper importable from the published package without React, Vue, or Svelte installed, so that it works in whatever test runner I already use.

### Documentation and release

68. As a package consumer, I want named exports and framework-specific prop types, so that imports are discoverable and refactor safe.
69. As a package consumer, I want relevant shared types re-exported from each framework subpath, so that common usage does not require deep type imports.
70. As a documentation reader, I want wrapper-based React and Vue examples to be the primary integration guidance, so that I begin with the supported ergonomic path.
71. As a documentation reader, I want the styling and chrome-composition boundary stated with its supported alternatives, so that I learn the limit and the workaround together rather than discovering it mid-integration.
72. As an advanced web-component consumer, I want low-level custom-element guidance retained, so that direct DOM integration remains documented without being the framework default.
73. As a release maintainer, I want packed React and Vue consumer fixtures without Svelte dependencies, so that the published artifact contract is verified rather than assumed from workspace builds.
74. As a release maintainer, I want SSR import safety tested without browser globals, so that accidental browser-only top-level imports cannot ship.
75. As a release maintainer, I want multi-viewer isolation tested through consumer-visible behavior, so that handles and selector runtimes cannot cross viewer boundaries.
76. As a maintainer, I want one framework-neutral selector implementation shared by plugins and wrappers, so that equality, memoization, cadence, disposal, and error semantics do not drift.

## Implementation Decisions

### Shape and ownership

- React and Vue integrations are framework wrappers: each hosts the Triiiceratops custom element and translates its existing contract. Neither wrapper mounts the native Svelte component or implements another viewer.
- The public entry points are `triiiceratops/react` and `triiiceratops/vue`. Both use named exports only.
- React 19 and Vue 3.5 are optional peer dependencies. Svelte remains optional and is not a consumer requirement — at runtime or at type-check time — for these entry points.
- Framework modules are authored as plain TypeScript using `createElement` and `h`, and are distributed as precompiled JavaScript and declarations built by the existing `build:lib` (`svelte-package`) step. No JSX, no Vue single-file components, and no additional bundler or build step is introduced.
- The wrappers use the self-contained ESM custom-element build, which includes Svelte and viewer styles behind the custom-element boundary.
- `<TriiiceratopsViewer>` owns the binding for its viewer: the element, its `ViewerState`, and exactly one selector runtime. Providers and handles distribute that binding; they never own it.
- The wrapper renders exactly one custom element and no other DOM. It accepts no children in either framework; the default slot and `children` remain unused and reserved.

### The state bridge on the custom element

- The custom element gains a read-only `viewerState` property, implemented as a Svelte instance export so the compiler emits a getter-only property on the element prototype. Its value is `undefined` before the inner viewer mounts and after disconnection. Host assignment is physically impossible.
- `$host()` and `customElement.extend` are not used; `$host()` does not compile under the repository's `customElement: false` check configuration.
- The element emits `viewerstateavailable` for each mounted state instance, bubbling and composed like the existing channels. Its detail is the exact same `ViewerState` object exposed by the property.
- `viewerstateavailable` means only that a wrapper can bind to `ViewerState`. It does not mean a manifest has loaded, OpenSeadragon is ready, or a requested canvas is visible.
- The state bridge is listen-then-check: wrappers attach the lifecycle listener and then read `viewerState`, covering state that becomes available before, during, or after wrapper initialization.
- Ordinary state updates do not repeat the event. A disconnection that destroys the inner component and a later reconnection produce a new state instance and a new event.
- The `viewerState` getter is also the version handshake: its presence on the registered constructor's prototype is how a wrapper confirms it is talking to a compatible core.
- The custom element gains `searchProvider` as a property-only input forwarded to the existing native search behavior. It has no reflected attribute; the property is the only supported channel, and a non-function value is ignored with a debug-gated warning.

### Registration and version conflicts

- Importing a framework entry point has no top-level dependency on `window`, `document`, or `customElements` and is safe during SSR evaluation.
- On the client, registration is lazy, automatic, idempotent, and shared. One memoized operation serves every wrapper instance, and its failure is memoized too so a second instance fails immediately rather than retrying.
- Registration dynamically imports the element bundle by relative specifier. A build-time assertion verifies the artifact exists, because it is produced by a later build step than the wrapper modules.
- After registration, the wrapper probes the constructor that actually owns the tag for the `viewerState` getter. A missing getter is reported as a framework-native version conflict with a diagnostic naming the likely cause. An existing `TriiiceratopsCoreConflictError` is passed through rather than reformatted.
- Detection is deterministic. There is no timeout, deadline, retry, or `customElements.whenDefined` polling used as a readiness signal, and the browser runtime's global first-wins rule is unchanged — incompatibility is diagnosed at the framework-wrapper boundary only.

### Props

- Shared, framework-neutral prop metadata classifies every viewer input into one of three tiers, and one shared applier in core's substrate performs all assignment for both wrappers.
- **Attribute tier** — `manifestId` → `manifest-id`, `canvasId` → `canvas-id`, `theme` → `theme`: rendered declaratively as kebab-case attributes, on the server and on the client's first render alike.
- **Property tier** — `manifestJson`, `themeConfig`, `config`, `initialCanvasRegion`, `plugins`, `searchProvider`: assigned imperatively as element properties, never server-rendered. Inputs that accept a string _or_ an object route to the property unconditionally; assignment never branches on the runtime type of the value.
- **Host attributes** — `className`/`class`, `style`, `id`, `data-*`, `aria-*`, and ordinary DOM attributes: forwarded declaratively to the element, server and client.
- The applier does not await registration. Svelte's custom element ports properties that were assigned before upgrade, so imperative assignment is safe in either order and first paint is never gated on a dynamic import.
- All tiers are edge-triggered: a write happens only when the prop value differs from the previously applied prop value, never because the element's own state has diverged. Re-asserting an unchanged `canvasId` after the user navigates internally writes nothing.
- Property-tier change detection uses one uniform, one-level `shallowEqual`: identical by `Object.is`; or both arrays with equal length and `Object.is` elements; or both plain objects with equal own-key sets and `Object.is` values. Deep equality, serialization comparison, and value-specific identity heuristics are not used.
- In development, a wrapper warns once, naming the prop, when a property-tier input has been re-assigned an implausible number of times over its lifetime, so unmemoized object props are diagnosable rather than mysterious.
- `manifestId` and `canvasId` remain one-way owner-to-viewer inputs, documented as uncontrolled inputs. React controlled-component enforcement and Vue `v-model` are not introduced.
- The wrappers never forward a `viewerState` prop.

### Access model

- Consumers create the handle and pass it to the component; the helpers take that handle. This keeps application UI free of any placement constraint imposed by the wrapper.
- React exports `useViewerHandle()` for a stable handle, accepts it through a `handle` prop, and ships `<ViewerProvider value>` as a trivial optional value-provider for deep trees.
- Vue uses an ordinary template ref (`useTemplateRef`) as the handle, its composables accept that ref, and it ships `provideViewer()` for deep trees. A provider component is unnecessary in Vue.
- The handle is optional. A viewer with no state-reading consumers needs no handle and no provider.
- Reads are nullable until the viewer's state exists. Nothing is gated or withheld to manufacture non-nullability; there is no readiness fallback channel.
- React `Suspense` integration is deliberately deferred as purely additive future surface, not designed around now.
- Handle lifecycle: a handle created but never passed to a viewer warns once in development; a second viewer claiming a bound handle throws, naming both elements; a handle whose viewer unmounts reverts to unbound and rebinds cleanly on remount.
- `useViewer()` returns `ReadonlyViewerState`, exported as `Readonly<Omit<ViewerState, 'setEventTarget' | 'setViewerElement' | 'destroy' | 'destroyAllPlugins'>>`. This is a type-level view of the same live object — no facade class, no `Proxy`, no wrapper instance — so identity comparisons against `ViewerHandle.state` hold.
- Reading notifying state through `useViewer()` does not subscribe; reactive reads use `useViewerSelector()`.

### Selectors

- The framework-neutral selector runtime and its contracts are core-owned in a lightweight state module with no Svelte runtime import. Core does not depend on the plugin SDK.
- The plugin SDK consumes the core-owned runtime, retains plugin-specific error attribution, and preserves its existing public `createSelectorRuntime` re-export and framework-helper signatures.
- Plugin activations and framework wrappers each own separate selector runtimes. They share implementation and `ViewerState`, not lifecycle or subscriptions.
- Every runtime owns exactly one `ViewerState.subscribe` registration and fans out to its projections. Notifications retain the existing batched, no-payload semantics.
- The runtime creates cheap per-consumer memoized projection objects from a `(projection, equality)` pair. Framework helpers create a new projection object when their inputs change; they never mutate a shared selector during render, so React stays correct under concurrent rendering.
- Equality gates the projection's _cached value_, not only its notifications: a recompute whose result is equal returns the previously returned reference. This makes the projection a valid React `getSnapshot` with no extra machinery, and is an intentional, documented improvement to what `Selector.get()` returns for plugins.
- Projections expose two read entry points sharing one gated cache: a version-memoized read for React's external-store contract, and a dependency-driven recompute that bypasses the version memo for Vue's `computed`.
- `useViewerSelector()` accepts a handle, a typed projection over readonly viewer state, and options `{ equals, cadence }`. The selected return type is inferred and equality defaults to `Object.is`.
- Cadence selects which notification wakes a projection. `state` (default) is the batched inventoried-member watcher. `frame` is driven by the live OpenSeadragon instance's own animation events, attaching lazily when an OSD instance appears and detaching on teardown or replacement. There is no persistent `requestAnimationFrame` loop and an idle viewer costs nothing.
- Cadence is a selector concern only. No `ViewerState` fields, state-inventory entries, watched members, batching behavior, or plugin subscription semantics change, and the plugin SDK's `selectors.select` signature is unchanged for now.
- In development, a `state`-cadence projection that reads through `osd` warns once and names `cadence: 'frame'`.
- React's helper integrates with React's external-store contract, supports inline projections and current equality inputs without memoization hooks, and omits `getServerSnapshot`: state-reading components do not render on the server, so a missing server snapshot is a loud, correct failure rather than an undesigned path. `use-sync-external-store` is not added as a dependency.
- Vue's helper is a `computed` over the runtime's notification version and the projection's dependency-driven recompute. This makes Vue reactive dependencies tracked automatically and makes a failing projection throw during the consumer's own evaluation, reaching Vue's native application error handling. A pushed `shallowRef` updated from the subscription callback is explicitly not the design, because it would either swallow projection failures or freeze a stale value.
- Vue's composables read the handle _and_ the runtime's version inside the `computed`, so a rebound handle rewires automatically after the element is detached and reattached.
- A consumer projection or equality failure is retained and surfaced through framework-native application error handling. It is not swallowed, converted to `viewererror`, attributed as `pluginerror`, or returned as a stale selected value.
- `useViewerSelector` intentionally shares its name with the plugin SDK's React and Vue helpers: it is the same domain concept, and after this work the same implementation. The SDK signatures are frozen here; adding cadence to the SDK is the future convergence path.

### Events

- React translates existing custom-element channels into `onStateChange`, `onCanvasChange`, `onManifestChange`, `onChoiceChange`, `onPluginError`, and `onViewerError` props.
- Vue translates those channels into `stateChange`, `canvasChange`, `manifestChange`, `choiceChange`, `pluginError`, and `viewerError` emits, usable with Vue's normal template event casing.
- Framework handlers receive typed event detail rather than a raw `CustomEvent`. The four state channels carry `ViewerStateSnapshot`; the error channels carry the exact `PluginError` (including `retry()`) and `ViewerError` objects.

### Server rendering

- On the server, a wrapper renders an inert `<triiiceratops-viewer>` host with the attribute tier and forwarded host attributes only. It does not render shadow-DOM internals, property-tier values, or state-reading application content.
- The client's first render emits the identical attribute set, so hydration reuses and upgrades the same host with no mismatch.
- Because reads are nullable rather than gated, server and client agree without any special-cased readiness rendering.

### Lifecycle

- Both wrappers expose the following imperative contract through React refs and Vue template refs:

```ts
interface ViewerHandle {
    readonly element: TriiiceratopsViewerElement;
    readonly state: ReadonlyViewerState;
}
```

- Core keeps a `WeakMap` from `ViewerState` to its selector runtime, so a consumer-held handle resolves its runtime internally and `ViewerHandle` stays exactly two members.
- Availability is repeatable, not a one-shot latch. On each `viewerstateavailable` after the first, a wrapper atomically disposes the previous selector runtime, publishes the new binding, and rebuilds the handle, so no consumer ever holds a projection subscribed to a disposed runtime.
- Re-availability is expected under Vue `<KeepAlive>`, which detaches the element long enough for Svelte to destroy the inner component and its `ViewerState`. In development a wrapper warns once when it sees a second availability event, because the accompanying viewer-state loss is otherwise silent.
- Preserving or restoring viewer state across element teardown is not attempted; that would require the wrapper to own a second state surface.
- Wrapper teardown removes all DOM listeners, disposes its selector runtime, clears bindings and handles, and allows the custom element's existing disconnected lifecycle to destroy viewer internals. Cleanup and registration are idempotent.

### Core corrections this work depends on

- Four public `ViewerState` members typed with `SvelteSet`/`SvelteMap` are annotated with `Set`/`Map` while still constructing the reactive collections, removing `svelte/reactivity` from the published declaration graph. The invariant that these members hold reactive collections moves from the type system to the state inventory and documentation.
- The wrappers' `plugins` prop accepts `readonly SdkPlugin[]` only. Legacy `PluginDef` carries Svelte component types and a Svelte runtime requirement, so it is not offered through the framework wrappers.
- Both plugin lifecycle effects in `TriiiceratopsViewer.svelte` diff the incoming list against live activations **by plugin object reference**: a plugin present before and after is left completely untouched, an absent one is deactivated, and a newly present one is activated. Because the legacy path mints a fresh id per registration for anonymous plugins, identity must key on the object reference with the assigned id retained across effect runs. `retry()`'s deliberate full replacement of a single plugin is unchanged.

### Packaging and release

- Existing custom-element state snapshots and event names remain intact. The state bridge and `searchProvider` are additions, not a redesign of the low-level event API.
- Package exports, runtime-dependency checks, public API reports, build ordering, release artifact packing, and consumer fixture orchestration are extended for the new subpaths without creating separately versioned packages.
- The API report will list an inert `searchprovider` observed attribute, because Svelte derives observed attributes from every declared prop. It is annotated as unsupported in the snapshot so a future contributor does not wire it up.

### Superseded decisions

Recorded mid-epic, after the wave-1 integration gate. Where these conflict with anything
above or with a ticket, these win.

- **The `Component` leak is not "resolved by scope".** This spec asserted that restricting
  the wrappers' `plugins` prop to `readonly SdkPlugin[]` kept Svelte out of the framework
  subpaths' declaration graph. That reasoning was incomplete: the leak arrives through
  `ViewerState` itself, which publicly exposes `pluginMenuButtons`, `pluginPanels`,
  `pluginFlyouts`, and `registerPlugin(def: PluginDef)` — all annotated with
  `Component<any>` from `svelte`. Because `ReadonlyViewerState` is
  `Readonly<Omit<ViewerState, …>>`, and `Omit` still forces the full `ViewerState`
  declaration to resolve, no amount of member omission removes the import. User story 8,
  tickets 06/07's `skipLibCheck: false` type test, and ticket 10's type-dependency criterion
  were therefore all unsatisfiable as originally written.
- **The Svelte-only `PluginDef` path is dropped for 1.0** (ticket 12), rather than retyped
  behind a Svelte-free structural stand-in. This supersedes ticket 03's "Do not change
  `PluginDef`, `PluginPanel`, `PluginFlyout`, or `PluginMenuButton`" constraint and its
  statement that "`PluginDef` itself is unchanged for existing Svelte and custom-element
  consumers". It is a breaking change to core's public API.
- Only `PluginDef` was ever legacy. `PluginMenuButton`, `PluginPanel`, and `PluginFlyout`
  are live types shared by both chrome paths; each carries a `PluginDef`-path field
  (`icon`, `component`) beside its SDK-path equivalent (`iconDescriptor`, `mount`).
  Dropping `PluginDef` is what lets the paired fields go, leaving those three types clean.
- The Out of Scope entry "Legacy `PluginDef` support through the framework wrappers" still
  holds, but now trivially: `PluginDef` no longer exists anywhere.
- `PluginUiTarget` is **not** part of the legacy path and stays exported. The plugin SDK's
  `definePlugin` and the annotation-editor plugin both consume it.

## Testing Decisions

- Tests assert external behavior and published-package usability, not internal hook counts, private fields, Svelte effects, or exact implementation structure.
- Wrapper unit tests mount the **real** custom element in the existing happy-dom vitest environment, driving React with `react-dom/client` and Vue with `createApp`. Idealized element doubles are not used, because every hazard worth testing — pre-upgrade property porting, kebab attribute mapping, the asynchronous `connectedCallback`, state availability timing, re-availability after detachment — lives in the real element's semantics. A fake constructor is used for exactly one case: the incompatible-pre-registration probe, which requires an element lacking the `viewerState` getter.
- Focused unit tests cover the selector runtime's memoization, equality gating of the cached value, both read entry points, dynamic projection invalidation, cadence selection and ticker attach/detach, error retention, single-subscription fan-out, and idempotent disposal.
- Tests cover identity-keyed plugin activation directly: re-supplying an equal plugin list must leave activations, subscriptions, injected styles, and registered chrome untouched.
- Packed consumer applications remain the primary release seam. Two fixtures — React 19 and Vue 3.5 Vite applications — install the exact packed artifacts used for release, with no workspace source links, no Svelte dependency, and no Svelte Vite plugin.
- Each packed fixture covers the full browser contract: automatic shared registration with no explicit registration import; all three prop tiers including complex and function-valued inputs; post-mount prop updates; unchanged-prop writes suppressed; `searchProvider`; host-attribute forwarding; absence of an extra layout element; commands; selected reads at both cadences; every translated event channel with exact object identity including a callable plugin `retry()`; the imperative handle; unmount/remount with no stale callback, projection, or binding; and two viewers proving complete isolation of state, selector output, command effect, callbacks, and handles.
- Each packed fixture additionally serves a server-rendered route that hydrates with zero mismatch diagnostics and then operates the upgraded viewer, and a route that pre-registers a foreign `triiiceratops-viewer` and asserts a prompt framework-native version-conflict failure. Hydration and conflict detection both require a real DOM, so they belong inside these fixtures rather than in separate Node-only ones.
- React coverage includes inline projections whose closures change and current equality inputs, with no manual memoization. Vue coverage includes projections that read changing Vue reactive dependencies, and a `<KeepAlive>` round trip proving the composable rewires to the new binding.
- Consumer projection and equality failures are exercised in both fixtures and must reach framework-native error capture — never `viewererror`, `pluginerror`, silently stale output, or an unhandled core subscription log.
- A driver-level assertion, alongside the existing tarball and dependency-absence checks, imports both packed subpaths in Node with no browser globals and asserts evaluation succeeds with no registration side effect. This is the one genuinely DOM-free case and needs no fixture install.
- The consumer testing helper is verified through the packed fixtures: importable from the tarball, usable with no React, Vue, or Svelte installed, and capable of driving a real command that a real projection observes.
- Type tests compile representative React and Vue consumers and verify prop types, callback and emit payloads, handle types, `ReadonlyViewerState` including the absence of lifecycle plumbing, selector input types, cadence options, and inferred selector return types. At least one type-test consumer compiles with `skipLibCheck: false` and no Svelte installed, so a Svelte type leak fails the build.
- Existing prior art includes packed npm/pnpm consumer fixtures, the Web Component ESM fixture, React/Vue plugin SDK adapter tests, `ViewerState.subscribe` SSR tests, custom-element API reports, state-inventory capability tests, the SvelteKit SSR hydration harness, and the existing real-component mount tests under vitest.
- Release checks must build and test framework subpaths from clean packed artifacts under both supported package-manager paths already exercised by the consumer harness. New fixtures are consolidated deliberately: two fixtures covering strictly more than six would have, to keep the packed matrix affordable.

## Out of Scope

- React Native or non-DOM rendering.
- Next.js-specific, Nuxt-specific, or other framework-meta-framework components.
- Server rendering of viewer shadow-DOM internals, manifests, canvases, OpenSeadragon, or state-reading application UI.
- Restyling the viewer's shadow-DOM internals beyond the existing theme tokens; no `::part()` surface, injected consumer stylesheets, or light-DOM styling hooks.
- Composing viewer chrome from consumer framework components; no framework-agnostic chrome slot contract.
- Light-DOM children or shadow-root slots on the custom element.
- React controlled-component enforcement for manifest or canvas state, and Vue `v-model` bindings for viewer state.
- React `Suspense` integration or any suspending read.
- Predefined field-specific helpers such as `useCurrentCanvas`, `useManifest`, or `useZoom`; cadence generalizes what those would have solved.
- Mirroring OpenSeadragon viewport values into `ViewerState` fields or the state inventory.
- A framework-specific state store, snapshot model, command facade, or second viewer-state contract, including any runtime facade or `Proxy` over `ViewerState`.
- A second React-native or Vue-native implementation of the viewer.
- Redesigning plugin mounting, plugin framework adapters, compatibility negotiation, activation semantics, or plugin lifecycle ownership. The plugin work here is confined to identity-keyed diffing in the two existing effects.
- Legacy `PluginDef` support through the framework wrappers.
- Changing the plugin SDK's public selector or adapter signatures.
- Removing or replacing existing custom-element events and snapshots, or changing the browser runtime's global first-wins rule.
- JSX, Vue single-file components, or any additional bundler or build step for the new entry points.
- Expanding support to React 18, Vue versions before 3.5, or unlisted framework versions.
- Requiring direct custom-element consumers to adopt the framework wrappers.
- Solving the custom element's existing shadow-root CSP requirements.

## Further Notes

- Canonical vocabulary follows the project glossary: these integrations are framework
  wrappers, not framework-native viewers or adapters; they consume the owning viewer's
  `ViewerState` and its isolated selector runtime.
- The design extends the existing decisions that `ViewerState` is the sole
  integration-facing state surface (ADR 0007) and that notifications are
  reactivity-driven, batched, and payload-free (ADR 0008). ADR 0011 adds selector
  cadence as the way continuous viewport values become reactively readable without
  mirroring them into viewer state.
- Display state and selector runtimes remain per viewer instance. Sharing custom-element
  registration or manifest caching across a page does not imply shared viewer state.
- Two decisions in this plan trade a type-system guarantee for a documented one, and both
  are recorded deliberately: reactive-collection members lose their `SvelteSet`/`SvelteMap`
  annotation, and lifecycle plumbing is hidden by a type view rather than by runtime
  encapsulation.
- Three development-only warnings exist because their failure modes are otherwise
  entirely silent: unmemoized property-tier props, a handle that was never passed to a
  viewer, and a batched-cadence projection reading through `osd`. A fourth warns on
  re-availability, where the silent consequence is viewer-state loss.
- **Precision on "development-only", added 2026-08-01.** There is no development/production
  distinction anywhere in the mechanism: all four warnings are gated on `ViewerConfig.debug`,
  never on `NODE_ENV` or a build condition. "Development-only" throughout this spec means
  "off unless the consumer passes `config: { debug: true }`". Because the wrappers and the
  self-contained element bundle carry SEPARATE instances of the logger module in the
  published package, the wrapper side of that flag is bridged when the property-tier applier
  writes `config` (`framework/debugFlag.ts`); a `config` with no `debug` key states no
  opinion, so pass `config: { debug: false }` to turn the warnings back off.
- The packed-consumer contract remains the highest and primary verification seam. Narrower
  tests exist for static typing, server import evaluation, real-element semantics, and
  selector mechanics that are materially clearer below that seam.
