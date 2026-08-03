## What to build

Make framework wrappers the primary documented React and Vue integration path. Teach the
handle-based access model, typed props, automatic registration, selectors and cadence,
callbacks and emits, one-way input semantics, search, SSR, and consumer testing — and state
the styling and chrome-composition boundary with its supported alternatives, rather than
leaving consumers to discover it mid-integration. Retain direct custom-element guidance as an
explicitly low-level option.

## Where to start

- Replace the low-level framework quick starts in `docs/index.md` and `docs/integration.md`.
- Update framework examples, custom search, event handling, and one-way canvas guidance in
  `docs/configuration.md`.
- Correct the stale statement in `docs/plugins.md` that the custom element does not expose
  viewer state.
- Use `scripts/docs-examples.mjs` and the packed docs-examples fixture to keep code blocks
  type-checked against public declarations.
- Use the accepted vocabulary in `CONTEXT.md` — **Framework wrapper**, **Viewer state**,
  **Selector**, **Selector cadence**, **Activation**, **Query-only state** — and the decisions
  in ADRs 0007, 0008, and 0011.

## Contract

### Primary path

- Primary examples import named APIs from `triiiceratops/react` or `triiiceratops/vue`. They do
  not configure custom-element tags, manually assign properties, add DOM event listeners,
  import registration, or install Svelte.
- Explain that a framework wrapper hosts one custom element and owns no second viewer, and that
  Svelte is required neither at runtime nor at type-check time.
- Show each framework's own idiom, not a lowest common denominator: React's `useViewerHandle()`
  plus a `handle` prop, Vue's ordinary template ref. Show the optional deep-tree distribution
  (`<ViewerProvider value>`, `provideViewer()`).
- Show that application UI can live anywhere relative to the viewer, including nested in the
  consumer's own layout boxes. Make clear the component accepts no children/slot content.
- Document that reads are `undefined` until the viewer's state exists, and show the idiomatic
  handling in each framework.

### State and selectors

- Document `useViewer()` for commands and non-reactive reads, `useViewerSelector()` for reactive
  reads. Frame them with the mental model consumers already have: the handle is the store, the
  selector is the reactive read.
- Document **cadence**: `state` for batched member changes, `frame` for continuous OSD viewport
  values such as zoom and pan. Show a zoom readout as the worked example, and explain why
  per-frame values are not batched members (ADR 0011).
- Document that projections must read inventoried command/observable members at `state` cadence,
  name the checked-in state inventory as the authority on what notifies, and state that reading
  through `osd` at `state` cadence warns in development and needs `cadence: 'frame'`.
- Document equality gating and that inline projections need no `useCallback`/`useMemo` in React
  and no manual watcher in Vue.

### Props, events, lifecycle

- Document all typed props including `searchProvider`, which inputs are attributes and which are
  properties, forwarded host attributes, and that `plugins` accepts SDK plugins only.
- Document `manifestId`/`canvasId` as **uncontrolled inputs** — the `defaultValue` + `onChange`
  pattern, not `value` + `onChange` — and show synchronizing from `onCanvasChange` or a selector.
- Warn that unmemoized object props are re-applied, name the development warning, and show the
  fix. State that an equal plugin list leaves running plugins untouched.
- Document direct callback/emit payloads and the small `ViewerHandle` escape hatch.
- Document inert-host SSR, client-only viewer internals, automatic registration, and fail-fast
  version conflicts, without claiming Next.js/Nuxt-specific support.
- Document Vue `<KeepAlive>`: the wrapper rebinds cleanly, **and** viewer state does not survive
  deactivation, because the element destroys it. Note the development warning.

### Testing and boundaries

- Show consumers how to unit-test their own components with the ticket 08 helper.
- Add a clearly labeled boundary section: what can and cannot be restyled (theme tokens are the
  supported surface; shadow-DOM internals are not reachable), and "build your own controls" —
  application-owned UI outside the viewer driven by commands and selectors — as the supported
  answer for custom toolbars. State plainly that composing viewer chrome from consumer framework
  components is not supported.
- Retain direct HTML/DOM custom-element examples in a clearly identified low-level section,
  including the state bridge and `searchProvider` property where relevant.

## Out of scope

- Do not document React Native, React 18, older Vue, controlled inputs, `v-model`, predefined
  state hooks, `Suspense`, or meta-framework-specific components.
- Do not document light-DOM slots, `::part()`, or any styling escape hatch that does not exist.
- Do not remove low-level custom-element documentation.
- Do not add examples that import private or internal modules.
- Do not document legacy `PluginDef` usage through the wrappers.

## Acceptance criteria

- [ ] React and Vue primary guides use only the new wrapper APIs and compile against packed declarations.
- [ ] Each framework's guide reads as idiomatic for that framework rather than as one shared example rewritten twice.
- [ ] Props, events, state helpers, cadence, handles, SSR, one-way inputs, plugin lists, and consumer testing are documented for both frameworks.
- [ ] The styling and chrome-composition boundary is documented together with its supported alternatives.
- [ ] `<KeepAlive>` rebinding and its state-loss consequence are documented.
- [ ] Low-level custom-element guidance remains available, and no stale statement says viewer state or custom search is Svelte-only.
- [ ] Documentation example checks, packed declaration checks, and the docs build pass.

Run:

```sh
pnpm docs:examples:check
pnpm test:packed
pnpm docs:build
```

Success is every command exiting `0`, generated examples being current, packed fixtures
type-checking the shown imports, and the documentation site building without broken references.

## Blocked by

- 06 (`06-react-framework-wrapper.md`)
- 07 (`07-vue-framework-wrapper.md`)
- 08 (`08-consumer-testing-helper.md`)
