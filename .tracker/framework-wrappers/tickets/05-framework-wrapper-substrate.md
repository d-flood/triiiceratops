## What to build

Create the framework-neutral substrate both wrappers use: lazy shared registration with
deterministic version-conflict detection, the prop metadata and the single applier that
assigns every viewer input, handle and binding lifecycle including repeatable
re-availability, and the shared types. No React or Vue code lives here.

## Where to start

- Build on the core selector runtime from ticket 01, the element bridge from ticket 02, and
  the clean type surface from ticket 03.
- Read first-wins registration in `packages/core/src/lib/browser-runtime.ts`. Note
  `defineViewerElement` (~line 168) returns `false` **silently** when the tag is already
  defined — that silent path is the hang this ticket must diagnose. Note also
  `installBrowserRuntime` throws `TriiiceratopsCoreConflictError` (~line 233) for a
  different core version.
- Read the ESM registration entry `packages/core/src/lib/element.ts` and the artifact it
  builds to (`dist/triiiceratops-element.js`, produced by `build:element`, which runs
  _after_ `build:lib`).
- Read Svelte's custom element `connectedCallback` in
  `node_modules/svelte/src/internal/client/dom/elements/custom-element.js`. Two behaviors
  the applier depends on: attributes are read into `$$d` on connect, and **properties
  assigned before upgrade are ported into `$$d` and then deleted** from the instance. Also
  note `connectedCallback` awaits a microtask, and `disconnectedCallback` destroys `$$c`
  after a microtask if still disconnected.
- Read `ViewerState.subscribe` teardown in `packages/core/src/lib/state/viewer.svelte.ts`.
- Put shared element, binding, event-detail, prop-metadata, `ViewerHandle`, and
  `ReadonlyViewerState` types in core-owned framework-neutral modules; not in either
  framework entry.

## Contract

```ts
interface ViewerHandle {
    readonly element: TriiiceratopsViewerElement;
    readonly state: ReadonlyViewerState;
}

type ReadonlyViewerState = Readonly<
    Omit<
        ViewerState,
        'setEventTarget' | 'setViewerElement' | 'destroy' | 'destroyAllPlugins'
    >
>;
```

### Module evaluation

- Module evaluation is SSR-safe and touches no browser global. Registration happens only
  from a browser lifecycle callback, never at module scope.

### Registration and conflict detection

- One memoized `ensureViewerElementRegistered()` serves every wrapper instance: lazy,
  automatic, idempotent, shared. **Both outcomes are memoized**, so a second instance fails
  immediately instead of re-importing.
- It dynamic-imports the element bundle by **relative specifier** (`./triiiceratops-element.js`),
  not by package self-reference. Add a build-time assertion that the artifact exists, because
  it is produced by a later build step than these modules.
- A rejected import is surfaced framework-natively. `TriiiceratopsCoreConflictError` is
  **passed through** — its message is already the right diagnostic — not reformatted.
- After registration, probe the constructor that actually owns the tag:
  `customElements.get(TAG)` and check `'viewerState' in ctor.prototype`. A missing getter is
  reported as a version conflict naming the tag and the likely cause. This is the only check
  that catches `defineViewerElement`'s silent `false`.
- **No timers.** No timeout, deadline, retry, or `customElements.whenDefined` used as a
  readiness signal. Detection is deterministic.
- Probe `viewerState` only. Do not invent broader version-compatibility policy; "one core per
  page, first wins" is already settled.

### Prop metadata and the applier

- Shared metadata classifies every viewer input into one of three tiers, and **one applier**
  performs all assignment for both wrappers:
    - **Attribute tier** — `manifestId`→`manifest-id`, `canvasId`→`canvas-id`, `theme`→`theme`.
      Rendered declaratively as kebab attributes by each wrapper, on server and client alike.
    - **Property tier** — `manifestJson`, `themeConfig`, `config`, `initialCanvasRegion`,
      `plugins`, `searchProvider`. Assigned imperatively as element properties. Never
      server-rendered.
    - **Host attributes** — `class`/`className`, `style`, `id`, `data-*`, `aria-*`, other DOM
      attributes. Forwarded declaratively.
- Inputs that accept a string _or_ an object (`manifestJson`, `themeConfig`, `config`,
  `initialCanvasRegion`) route to the property **unconditionally**. Assignment must never
  branch on the runtime type of the value.
- The applier does **not** await registration. Svelte ports pre-upgrade properties, so
  assignment is safe in either order and first paint is never gated on a dynamic import.
- All tiers are **edge-triggered**: write only when the prop value differs from the previously
  applied prop value — never because the element's own state diverged. Re-asserting an
  unchanged `canvasId` after internal navigation writes nothing.
- Property-tier change detection uses one uniform **one-level `shallowEqual`**: `Object.is`;
  or both arrays with equal length and `Object.is` elements; or both plain objects with equal
  own-key sets and `Object.is` values; otherwise unequal. Deep equality, serialization
  comparison, and value-specific identity heuristics are forbidden.
- Development warning: warn once, naming the prop, when a property-tier input has been
  re-assigned more than **10** times over one wrapper's lifetime.
- The applier never assigns `viewerState`.

### Binding, handle, and re-availability

- Each mounted wrapper owns one binding: the element, its `ViewerState`, and exactly one
  selector runtime. Core keeps a `WeakMap` from `ViewerState` to its runtime so a
  consumer-held `ViewerHandle` resolves its runtime internally and `ViewerHandle` stays two
  members.
- Binding attaches `viewerstateavailable` handling **before** triggering registration, then
  reads `viewerState`, covering already-ready and later-ready elements.
- **Availability is repeatable, not a one-shot latch.** On each event after the first,
  atomically dispose the previous runtime, publish the new binding, and rebuild the handle,
  so no consumer ever holds a projection subscribed to a disposed runtime.
- Debug-mode warning: warn once when a wrapper observes a second availability event, because
  the accompanying viewer-state loss is otherwise silent.
- Handle lifecycle: a handle created but never bound warns once in debug mode; a second
  element claiming a bound handle **throws**, naming both elements; a handle whose element
  goes away reverts to unbound and rebinds cleanly on remount.
- Teardown removes DOM listeners, disposes the runtime, and invalidates the binding and
  handle. Repeated cleanup is safe.
- Consumer selector errors remain available for framework-native error handling rather than
  being reported as `viewererror` or `pluginerror`.

## Out of scope

- Do not implement React context/rendering or Vue injection/rendering; no framework imports.
- Do not create a visible wrapper element or a framework-specific state store.
- Do not build a runtime facade or `Proxy` over `ViewerState`. `ReadonlyViewerState` is a
  **type-level view** of the same live object; identity comparisons against
  `ViewerHandle.state` must hold.
- Do not change the browser runtime's global first-wins behavior; diagnose incompatibility at
  the framework-wrapper boundary only.
- Do not attempt to preserve or restore viewer state across element teardown.
- Do not add meta-framework-specific SSR integrations.

## Acceptance criteria

- [ ] Importing the substrate in Node with no browser globals succeeds and attempts no registration.
- [ ] Concurrent registration requests share one operation; a failed registration is memoized so a second caller fails immediately without re-importing.
- [ ] A pre-registered element lacking the `viewerState` getter is rejected promptly with a version-conflict diagnostic, using no timers.
- [ ] `TriiiceratopsCoreConflictError` is surfaced unmodified.
- [ ] Listen-then-check handles already-ready and later-ready elements with no duplicate bindings.
- [ ] The applier is exercised against the **real** custom element: object and function props arrive as properties (never stringified attributes) both before and after registration completes; attribute-tier props arrive as kebab attributes; host attributes reach the element.
- [ ] Edge-triggering is proven: an unchanged prop value writes nothing, including after the element's reflected attribute has diverged.
- [ ] `shallowEqual` suppresses writes for a fresh-but-equal array and a fresh-but-equal flat object, and permits them for a genuine change.
- [ ] A second availability event swaps runtimes atomically; no projection remains subscribed to the disposed runtime; the handle is rebuilt.
- [ ] Handle rules are covered: unbound warning, double-bind throw, unbind-and-rebind.
- [ ] Cleanup and remount prove listeners, runtime, binding, and handle are invalidated idempotently.
- [ ] All three debug-mode warnings fire once with `config: { debug: true }` and not at all without it. The gate is `ViewerConfig.debug`, not `NODE_ENV` — there is no development/production distinction in the mechanism — and it must hold in the PUBLISHED package, where the wrappers and the element bundle carry separate copies of the logger module.
- [ ] Core checks and the library build pass.

Run:

```sh
pnpm --filter triiiceratops exec vitest run src/lib/framework
pnpm --filter triiiceratops check
pnpm --filter triiiceratops build:lib
pnpm --filter triiiceratops build:element
```

Success is every command exiting `0`, including tests with no React, Vue, or browser runtime
present at module evaluation, and applier tests running against the real registered element
rather than an idealized double.

## Blocked by

- 01 (`01-generalize-selector-runtime.md`)
- 02 (`02-custom-element-state-bridge.md`)
- 03 (`03-remove-svelte-types-from-public-surface.md`)
