## What to build

Publish the Vue 3.5 framework wrapper at `triiiceratops/vue`. A Vue application must render
and control the existing custom element with typed props, an ordinary template ref as the
handle, composables at both cadences, typed emits, and the same imperative handle — without
Svelte, a Vue compiler transform, or manual custom-element configuration.

## Where to start

- Build on the substrate from ticket 05, which already owns registration, the prop applier,
  handle lifecycle, re-availability, and `ReadonlyViewerState`.
- Use `packages/plugin-sdk/src/vue.ts` as prior art for readonly refs and effect-scope
  cleanup, but note its shape is **not** the design here: it pushes values into a `shallowRef`
  from the subscription callback, which would swallow projection failures and freeze stale
  values. Its `PluginContext` API stays unchanged.
- Read the custom-element inputs/events and the shared framework types from earlier tickets.
- Add a new core Vue entry and export target. Do **not** create a package.

## Contract

Named exports:

```ts
TriiiceratopsViewer;
ViewerProvider;
provideViewer;
useViewer;
useViewerSelector;
// ViewerHandle, ReadonlyViewerState, Vue prop/ref types, and relevant shared public types
```

### Authoring and packaging

- Authored as plain `.ts` using `h()` and `defineComponent`. **No single-file components**, no
  `.vue` files, no additional bundler or build step — `build:lib`'s `svelte-package` step must
  produce `dist/vue.js` and `dist/vue.d.ts`.
- Because the component is a render function, consumers need **no** `compilerOptions.isCustomElement`
  configuration. Verify that claim in a test.
- Vue 3.5 is an optional peer dependency. `vue` stays a bare import specifier.

### Component

- Renders exactly one custom element and no other DOM. **No layout wrapper.** It accepts no
  slot content; the default slot remains unused and reserved.
- `inheritAttrs` is disabled and attrs are forwarded deliberately to the element.
- Typed props cover all existing viewer inputs plus `searchProvider`, routed through the
  substrate's three tiers. Property-tier values must go through the applier — **never** through
  vnode props, because Vue's `shouldSetAsProp` falls back to `setAttribute(key, String(value))`
  before the element is defined.
- `plugins` accepts `readonly SdkPlugin[]` only.
- `manifestId` and `canvasId` are one-way owner-to-viewer inputs, documented as uncontrolled.
- On the server, renders the inert host with the attribute tier and forwarded host attributes
  only; the client's first render emits the identical attribute set.

### Handle and access

- An ordinary template ref (`useTemplateRef('viewer')`) **is** the handle: it resolves to
  `ViewerHandle | null`. Commands are reached as `viewer.value?.state.…` — no composable
  required.
- `provideViewer(handleRef)` distributes the handle from setup for deep trees.
  `<ViewerProvider :value="handleRef">` is available for consumers who prefer a component.
  Neither gates anything and neither has a fallback.
- `useViewer()` resolves the injected handle and returns a readonly ref of
  `ReadonlyViewerState | undefined`. It fails clearly when nothing has been provided.

### Selectors

- `useViewerSelector(handleRef, projection, { equals, cadence })` returns a readonly
  `ComputedRef<T | undefined>`, with `T` inferred and `equals` defaulting to `Object.is`.
  Exactly one overload is permitted: when the first argument is a function, the handle is
  resolved from injection instead.
- The implementation is a **`computed`** over the runtime's notification version and the
  projection's dependency-driven recompute. A pushed `shallowRef` updated from the subscription
  callback is explicitly forbidden. The `computed` shape is what makes two requirements free:
  Vue reactive dependencies read by the projection are tracked, and a failing projection throws
  during the consumer's own evaluation so it reaches `app.config.errorHandler` and
  `onErrorCaptured`.
- The `computed` must read **both** the handle ref **and** the runtime's version inside its own
  body, so a rebound handle rewires automatically. Resolving the runtime once outside the
  computed is the specific bug to avoid: after a `<KeepAlive>` round trip the selector would
  silently read a disposed runtime forever.
- Equality gating comes from the substrate's cached value, so `computed`'s own `Object.is`
  dirty-check suppresses downstream updates for equal selections.
- Subscriptions and runtimes dispose with the owning effect scope.

### Events

- Emits: `stateChange`, `canvasChange`, `manifestChange`, `choiceChange` carry
  `ViewerStateSnapshot`; `pluginError` carries the exact `PluginError` including a callable
  `retry()`; `viewerError` carries the exact `ViewerError`. Never a `CustomEvent`. Usable with
  normal template casing (`@canvas-change`).

### Lifecycle

- Multiple wrappers and remounts retain isolated viewer states and idempotent cleanup.
- A `<KeepAlive>` deactivation/reactivation cycle destroys and rebuilds the element's
  `ViewerState`; the wrapper rebinds and every composable rewires to the new runtime.

## Out of scope

- Do not support Vue versions before 3.5, Nuxt-specific behavior, `v-model`, predefined
  field-specific selectors, or a Vue-owned viewer store.
- Do not accept slot content, render companion content, or project into light or shadow DOM.
- Do not add more than the one permitted `useViewerSelector` overload.
- Do not change the plugin SDK Vue composable signature or migrate it to this shape.
- Do not require consumer custom-element compiler configuration or a Svelte plugin.
- Do not attempt to preserve viewer state across `<KeepAlive>` deactivation.
- Leave the packed matrix to ticket 09 and the consumer test helper to ticket 08.

## Acceptance criteria

- [ ] Tests mount the **real** custom element in happy-dom with `createApp` and cover: template-ref handle binding, nullable reads before availability, all three prop tiers including function-valued `searchProvider`, post-mount updates, unchanged-prop writes suppressed, direct emit details, unmount/remount, and two-viewer isolation.
- [ ] A projection reading a Vue reactive dependency reruns when that dependency changes, with no manual watcher.
- [ ] A throwing projection reaches `app.config.errorHandler` / `onErrorCaptured` and is not reported as `viewererror` or `pluginerror`, and no stale value is returned.
- [ ] A `<KeepAlive>` deactivate/reactivate cycle produces a second availability event, and existing composables rewire to the new runtime and keep updating.
- [ ] A `cadence: 'frame'` selector updates from OSD animation events.
- [ ] A test proves no `compilerOptions.isCustomElement` configuration is needed.
- [ ] `triiiceratops/vue` builds as precompiled JS and declarations with named exports and no `.vue` files in the source tree.
- [ ] Type tests verify prop types, emit payloads, template-ref type, `ReadonlyViewerState` omitting the four plumbing methods, both selector forms, and inferred return types.
- [ ] Core checks and build pass.

Run:

```sh
pnpm --filter triiiceratops exec vitest run src/lib/vue
pnpm --filter triiiceratops check
pnpm --filter triiiceratops build:lib
pnpm --filter triiiceratops build:element
```

Success is every command exiting `0`, with `dist/vue.js` and `dist/vue.d.ts` present and
importing no `svelte*` specifier.

## Blocked by

- 05 (`05-framework-wrapper-substrate.md`)
