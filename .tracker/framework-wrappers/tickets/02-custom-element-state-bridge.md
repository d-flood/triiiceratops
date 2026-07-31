## What to build

Extend the existing custom element with the supported bridge framework wrappers need: its
actual per-instance `ViewerState` as a getter-only property, a precise state-availability
lifecycle event, and the native viewer's existing custom search capability as a
property-only input. Deliver and test this as a complete low-level custom-element feature.

## Where to start

- Read the custom-element prop declarations, internal state binding, and event-target
  wiring in `packages/core/src/lib/components/TriiiceratopsViewerElement.svelte`.
- Read state creation and the existing `searchProvider` prop/effect in
  `TriiiceratopsViewer.svelte` (state is assigned synchronously at component init, around
  line 245; `setSearchProvider` is called from an effect around line 306). Do not
  reimplement search.
- Read the existing event dispatch helper in `viewer.svelte.ts` (`dispatchStateChange`,
  around line 457): channels are `bubbles: true, composed: true`, dispatched via
  `queueMicrotask` from the viewer root inside the shadow root.
- Use `tests/wc-parity.spec.ts`, `src/lib/browser-runtime.test.ts`, and the generated
  custom-element API report as the existing contract seams.
- `docs/plugins.md` contains a now-stale statement that the custom element does not expose
  viewer state. Leave the full documentation migration to ticket 11.

## Contract

```ts
interface TriiiceratopsViewerElement extends HTMLElement {
    readonly viewerState: ViewerState | undefined;
    searchProvider?: SearchProvider | null;
}
```

- `viewerState` is implemented as a **Svelte instance export** — export the internal state
  binding under the name `viewerState`. The compiler emits a getter on the component
  instance and `create_custom_element`'s `exports` handling defines a **getter-only**
  property on the element prototype reading `this.$$c?.[prop]`. That yields the required
  contract with no custom code: `undefined` before the inner component mounts, `undefined`
  again after disconnection clears `$$c`, and no setter at all, so a host physically cannot
  replace the owning viewer's state.
- Do **not** use `$host()`: it is a compile error under the repository's `customElement:
false` check configuration (`svelte.config.js`), so it would break `pnpm check`. Do
  **not** use `customElement.extend`, and do **not** install the getter from
  `browser-runtime.ts` at registration time.
- Do **not** add `viewerState` to the `customElement.props` map. It is an export, not a prop.
- The element emits `viewerstateavailable` for each mounted state instance, bubbling and
  composed like the existing channels. Event detail and the property are the exact same
  object.
- `viewerstateavailable` means state can be bound. It does not mean a manifest or OSD is
  ready.
- A listener can use listen-then-check without a race: attach the listener, then read
  `viewerState`.
- Ordinary state updates do not repeat the event. A disconnection that destroys the inner
  component and a later reconnection produce a new state instance and its own event.
- The `viewerState` getter's presence on the registered constructor's prototype is the
  wrappers' version handshake (ticket 05 probes it). It must therefore live on the
  prototype, not be assigned as an own property at mount time.
- `searchProvider` is an ordinary Svelte prop forwarded to the existing native search
  behavior. Being in the props definition is deliberate: it is what makes Svelte port a
  property assigned before upgrade (`custom-element.js` `connectedCallback`), which ticket
  05's applier depends on.
- `searchProvider` has **no reflected attribute**, and the property is the only supported
  channel. Svelte derives an observed attribute from every declared prop, so an inert
  `searchprovider` observed attribute will exist; a non-function value is ignored with a
  debug-gated warning so a stray attribute string can never reach the search path.
- Existing properties, callback properties, snapshots, events, first-wins registration, and
  Svelte usage remain compatible.

## Out of scope

- Do not add framework wrappers, hooks, composables, or selector helpers.
- Do not expose a page-global viewer state.
- Do not change the search algorithm, search result model, or Search service behavior.
- Do not rename or replace existing custom-element events, or change their dispatch target,
  bubbling, or composed flags.
- Do not add light-DOM slots to the element.

## Acceptance criteria

- [ ] Before availability, `viewerState` reads as `undefined`; afterward it is identical to `viewerstateavailable.detail`.
- [ ] `viewerState` is getter-only on the element prototype: assignment throws in strict mode, and the property is present on the constructor's prototype (the handshake ticket 05 relies on).
- [ ] Ordinary state changes do not duplicate the availability event.
- [ ] Detach-then-reattach is tested for exactly one event per newly mounted state instance, and `viewerState` reads as `undefined` while detached.
- [ ] A property-assigned `searchProvider` reaches the existing search path; a non-function value is ignored with a debug-gated warning; no `search-provider` attribute is reflected.
- [ ] `pnpm check` passes with no new suppressed warnings beyond the one already recorded in `lint-allowlist.md`.
- [ ] The custom-element build, parity tests, and core checks pass.

Run:

```sh
pnpm --filter triiiceratops check
pnpm --filter triiiceratops exec vitest run src/lib/browser-runtime.test.ts src/lib/components
pnpm --filter triiiceratops build:lib
pnpm --filter triiiceratops build:element
pnpm --filter triiiceratops exec playwright test tests/wc-parity.spec.ts
```

Success is every command exiting `0` and the parity test observing the bridge through the
built custom element rather than a native Svelte component.

## Blocked by

None - can start immediately.
