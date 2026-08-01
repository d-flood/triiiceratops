## What to build

Publish the React 19 framework wrapper at `triiiceratops/react`. A React application must
render and control the existing custom element with typed props, a consumer-created handle,
selectors at both cadences, typed callbacks, and an imperative ref — without Svelte, JSX
build changes, or manual custom-element setup.

## Where to start

- Build on the substrate from ticket 05. Registration, the prop applier, handle lifecycle,
  re-availability, and `ReadonlyViewerState` all already exist; this ticket is React
  packaging over them.
- Use `packages/plugin-sdk/src/react.ts` **only** as prior art for React's external-store
  contract. Note it deliberately freezes the selector on first render (`useRef`), which this
  helper must _not_ do. Its `PluginContext` API stays separate and unchanged.
- Read the custom-element prop and event names from
  `packages/core/src/lib/components/TriiiceratopsViewerElement.svelte` and
  `ViewerStateSnapshot` from `src/lib/state/viewer.svelte.ts`.
- Add a new core React entry and export target. Do **not** create a package.
- Read the existing real-component mount tests under `src/lib/components/*.svelte.test.ts`
  for how to drive a real element in the happy-dom vitest environment.

## Contract

Named exports:

```ts
TriiiceratopsViewer;
ViewerProvider;
useViewerHandle;
useViewer;
useViewerSelector;
// ViewerHandle, ReadonlyViewerState, React prop/ref types, and relevant shared public types
```

### Authoring and packaging

- Authored as plain `.ts` using `createElement`. **No JSX**, no `.tsx`, no additional bundler
  or build step — `build:lib`'s existing `svelte-package` step must produce `dist/react.js`
  and `dist/react.d.ts`. A `.tsx` file would be copied verbatim and ship broken.
- React 19 is an optional peer dependency, not a runtime dependency of core. `react` stays a
  bare import specifier.

### Component

- Renders exactly one custom element and no other DOM. **No layout wrapper.** It accepts no
  children; `children` remains unused and reserved.
- Typed props cover all existing viewer inputs plus `searchProvider`, routed through the
  substrate's three tiers. Attribute-tier props are rendered as kebab attributes; property-tier
  props go through the applier; `className`, `style`, `id`, `data-*`, `aria-*`, and ordinary
  DOM attributes reach the element.
- `plugins` accepts `readonly SdkPlugin[]` only.
- `manifestId` and `canvasId` are one-way owner-to-viewer inputs, documented as uncontrolled
  inputs (`defaultValue` + `onChange`, not `value` + `onChange`).
- Accepts an optional `handle` prop. A viewer with no state-reading consumers needs no handle.
- On the server, renders the inert host with the attribute tier and forwarded host attributes
  only. The client's first render emits the identical attribute set.

### Handle and access

- `useViewerHandle()` returns a stable handle across renders and Strict Mode double-invocation.
- `<ViewerProvider value={handle}>` is a trivial value-provider for deep trees. It renders its
  children unconditionally; it gates nothing and has no fallback.
- `useViewer()` resolves the nearest provided handle and returns `ReadonlyViewerState | undefined`
  — `undefined` until the viewer's state exists. It fails clearly when called with no provider
  and no handle.
- A forwarded `ref` yields `ViewerHandle | null` and is cleared on unmount.

### Selectors

- `useViewerSelector(handle, projection, { equals, cadence })` returns `T | undefined`, with `T`
  inferred and `equals` defaulting to `Object.is`. A context form resolving the handle from the
  provider is also supported.
- Built on `useSyncExternalStore`. The projection object is created inside a `useMemo` keyed on
  the projection and equality identities, so inline projections and current equality inputs work
  with **no `useCallback` or `useMemo` from the consumer**, and no shared selector is mutated
  during render.
- `getSnapshot` returns the substrate's equality-gated cached value, so it is reference-stable
  while unchanged. `getServerSnapshot` is **omitted**: state-reading components do not render on
  the server, so a missing server snapshot is a loud, correct failure.
- Do not add `use-sync-external-store` as a dependency; hand-roll it.
- Consumer projection and equality failures surface through React error boundaries.

### Events

- Callback props: `onStateChange`, `onCanvasChange`, `onManifestChange`, `onChoiceChange` receive
  `ViewerStateSnapshot`; `onPluginError` receives the exact `PluginError` including a callable
  `retry()`; `onViewerError` receives the exact `ViewerError`. Never a `CustomEvent`.
- Listeners are installed with `addEventListener` and removed on teardown; changing a callback
  prop does not leak or duplicate listeners.

### Lifecycle

- Registration, cleanup, Strict Mode behavior, and multiple viewers are idempotent and isolated.
- A second availability event (e.g. after the element is detached and reattached) re-renders with
  the new binding and rebuilt handle.

## Out of scope

- Do not add React 18 support, React Native, a Next.js component, predefined field-specific
  selectors, or controlled-component enforcement.
- Do not implement `Suspense` integration or any suspending read.
- Do not accept `children`, render companion content, or project into light or shadow DOM.
- Do not alter the plugin SDK React helper signature.
- Do not require consumer JSX custom-element declarations or a Svelte Vite plugin.
- Do not accept legacy `PluginDef` in `plugins`.
- Leave the packed matrix to ticket 09 and the consumer test helper to ticket 08.

## Acceptance criteria

- [ ] Tests mount the **real** custom element in happy-dom with `react-dom/client` and cover: handle creation and binding, nullable reads before availability, all three prop tiers including function-valued `searchProvider`, post-mount updates, unchanged-prop writes suppressed, direct callback details, ref lifecycle, unmount/remount, and two-viewer isolation.
- [ ] Inline projections whose closures change return current values with no consumer memoization, and equality gating prevents re-render for equal selections; a projection returning a fresh object literal does not loop or warn.
- [ ] A `cadence: 'frame'` selector updates from OSD animation events; a `state`-cadence projection reading `osd` triggers the debug-mode warning under `config: { debug: true }`, in the PUBLISHED package as well as in source-resolved tests.
- [ ] A throwing projection is caught by a React error boundary and is not reported as `viewererror` or `pluginerror`.
- [ ] Strict Mode double-invocation creates one handle, one binding, and one subscription.
- [ ] `triiiceratops/react` builds as precompiled JS and declarations with named exports and no `.tsx` in the source tree.
- [ ] Type tests verify prop types, callback payloads, ref type, `ReadonlyViewerState` omitting the four plumbing methods, selector options, and inferred selector return types.
- [ ] Core checks and build pass.

Run:

```sh
pnpm --filter triiiceratops exec vitest run src/lib/react
pnpm --filter triiiceratops check
pnpm --filter triiiceratops build:lib
pnpm --filter triiiceratops build:element
```

Success is every command exiting `0`, with `dist/react.js` and `dist/react.d.ts` present and
importing no `svelte*` specifier.

## Blocked by

- 05 (`05-framework-wrapper-substrate.md`)
