---
icon: lucide/atom
---

# React

`triiiceratops/react` is a **framework wrapper**: a real React 19 component that
hosts the Triiiceratops custom element and translates its lifecycle, properties,
events, and viewer state into React idioms. It does not implement or own a
second viewer — there is exactly one viewer implementation, behind the
custom-element boundary.

That boundary is also where Svelte stays. You do **not** install Svelte, add a
Svelte plugin to Vite, declare a custom-element tag, register anything, or write
`useEffect` blocks that assign properties to a ref. `triiiceratops/react` is
precompiled JavaScript plus declarations that resolve with **no `svelte`
package installed**.

## Install

=== "pnpm"

    ```bash
    pnpm add triiiceratops
    ```

=== "npm"

    ```bash
    npm install triiiceratops
    ```

=== "bun"

    ```bash
    bun add triiiceratops
    ```

React 19 is an **optional peer dependency** — installing Triiiceratops for a
different integration never pulls React in, and React is never bundled into the
package.

## Your first viewer

```tsx
import { TriiiceratopsViewer } from 'triiiceratops/react';

export function Reader() {
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            style={{ display: 'block', height: '600px' }}
        />
    );
}
```

That is the whole integration. Some things worth knowing right away:

- **Registration is automatic.** The first `<TriiiceratopsViewer>` to mount in
  the browser lazily imports and registers the self-contained custom element.
  The work is memoized and shared, so a hundred viewers do it once. There is no
  side-effect import to remember and no `element/register` in a React app.
- **The wrapper renders exactly one element** — the `<triiiceratops-viewer>`
  host, and nothing else. No layout `<div>` wraps it, so adopting the wrapper
  changes no sizing or CSS. Give the host a height, as above.
- **It takes no children.** `children` is typed `never`; the viewer's chrome is
  not composable from React elements. See
  [what the wrapper does not do](#what-the-wrapper-does-not-do).
- **Styles are bundled inside the element's shadow root.** There is no
  stylesheet to import.

## The handle is the store

Everything that reads or commands the viewer goes through a **handle**. Create
it with `useViewerHandle()`, pass it to the component's `handle` prop, and read
through it:

```tsx
import {
    TriiiceratopsViewer,
    useViewer,
    useViewerHandle,
    useViewerSelector,
} from 'triiiceratops/react';

export function Reader() {
    const handle = useViewerHandle();

    // Reactive read: re-renders only when the selected value changes.
    const canvasId = useViewerSelector(handle, (state) => state.canvasId);
    // The live state object: commands and on-demand reads, no subscription.
    const viewer = useViewer(handle);

    return (
        <div className="reader">
            <p>{canvasId ?? 'No canvas yet'}</p>
            <button type="button" onClick={() => viewer?.nextCanvas()}>
                Next canvas
            </button>
            <TriiiceratopsViewer
                handle={handle}
                manifestId="https://example.org/manifest.json"
                style={{ display: 'block', height: '600px' }}
            />
        </div>
    );
}
```

If you already reach for `useForm`-style APIs, the shape is familiar: the hook
returns a stable box, the component fills it in, and helpers take the box.

**The handle is a stable box, not the state.** `useViewerHandle()` returns the
same object for the component's whole lifetime. What changes is the value inside
it — `null` until the element publishes its viewer state, a new binding after a
detach/reattach, `null` again on unmount. That is why the box is what you pass
around.

**Reads are `undefined` until the viewer's state exists.** Nothing is gated or
withheld to manufacture a non-nullable value; `undefined` is the honest state of
the world in the window between "React mounted the host" and "the custom element
finished mounting its viewer". Handle it the way you handle any other
asynchronous resource — the `??` and the optional call above are the whole
pattern.

**Your UI can live anywhere.** The examples put controls before the viewer, but
nothing about the wrapper constrains your markup: the handle is a value, so
controls can be siblings, ancestors, nested inside your own layout boxes, or in
a completely different part of the tree.

**The handle is optional.** A viewer that nothing reads from needs no handle at
all — the first example above passes none.

**One handle per viewer.** Passing the same handle to a second
`<TriiiceratopsViewer>` throws `TriiiceratopsHandleConflictError` naming both
elements, because ambiguous ownership would silently break per-viewer isolation.
Two viewers on a page means two `useViewerHandle()` calls.

### `useViewer()` vs `useViewerSelector()`

| | `useViewer(handle)` | `useViewerSelector(handle, projection, options?)` |
| :-- | :-- | :-- |
| Returns | `ReadonlyViewerState \| undefined` | the projected value, or `undefined` |
| Subscribes to state | **No** | Yes |
| Re-renders when | the viewer binds, rebinds, or unmounts | the selected value changes |
| Use it for | commands, one-shot reads inside handlers | anything you render |

Both also have a context form that omits the handle — see
[passing the handle to a deep tree](#passing-the-handle-to-a-deep-tree).

`useViewer()` returns a typed, readonly view of the very same live `ViewerState`
object the element owns — no facade, no `Proxy`, no copy — with the four
lifecycle-plumbing methods (`setEventTarget`, `setViewerElement`, `destroy`,
`destroyAllPlugins`) hidden so autocomplete offers only supported operations.
Identity comparisons hold: the object is reference-equal to
`handle.get()?.state` and to the element's own `viewerState`.

Reading a notifying member off that object does **not** subscribe to it. Reading
`viewer.canvasId` during render gives you the value at render time and no
re-render when it changes — that is what `useViewerSelector()` is for.

## Reactive reads

`useViewerSelector()` is one generic, memoized, equality-gated projection. `T`
is inferred from the projection, so reactive state access stays concise and type
safe:

```tsx
import { useViewerSelector } from 'triiiceratops/react';
import type { ViewerHandleSlot } from 'triiiceratops/react';

export function GalleryBadge({ handle }: { handle: ViewerHandleSlot }) {
    // `boolean | undefined`, inferred.
    const open = useViewerSelector(handle, (state) => state.showThumbnailGallery);
    return <span>{open ? 'Gallery open' : 'Gallery closed'}</span>;
}
```

### Equality gating

A projection is memoized twice over. Within one notification it is computed once
and repeated reads return the same reference — which is what makes an inline
projection a valid React external-store snapshot with no extra machinery. Across
notifications, the equality gate decides: when a recompute produces a value that
satisfies `equals`, the projection keeps returning the **previous reference**, so
React does not re-render.

`equals` defaults to `Object.is`, which is right for the primitives above. A
projection that builds a fresh object or array on every run is never
`Object.is`-equal to its predecessor, so it would re-render on every viewer
notification — give those an `equals`:

```tsx
import { useViewerSelector } from 'triiiceratops/react';
import type { ViewerHandleSlot } from 'triiiceratops/react';

export function CanvasCounter({ handle }: { handle: ViewerHandleSlot }) {
    const position = useViewerSelector(
        handle,
        (state) => ({
            index: state.currentCanvasIndex,
            total: state.canvases.length,
        }),
        { equals: (a, b) => a.index === b.index && a.total === b.total },
    );
    if (!position) return null;
    return (
        <span>
            {position.index + 1} / {position.total}
        </span>
    );
}
```

**No `useCallback` or `useMemo` is needed** on either the projection or the
equality function. Inline arrows whose closures change between renders read
current values, which is what makes the helper idiomatic under React 19 and the
React Compiler. Reads are correct under concurrent rendering and Strict Mode:
the helper is built on React's own `useSyncExternalStore`, and it never mutates a
shared projection during a render pass.

**All selectors for one viewer share one underlying subscription.** Adding
selector components does not multiply `ViewerState.subscribe` registrations.

**Projection failures reach your error boundary.** If a projection or equality
function throws, the failure is retained and rethrown from your component's own
read. It is never swallowed, never converted into a `viewererror` or
`pluginerror`, and never served as a stale selected value.

### Selector cadence

A **selector cadence** is which notification wakes a projection.

| Cadence | Woken by | Use it for |
| :-- | :-- | :-- |
| `state` (default) | the batched, payload-free viewer-state notification | everything in the [state inventory](#what-notifies) — canvas, manifest, panels, gallery, plugin UI |
| `frame` | the live OpenSeadragon instance's own animation events, **and** state notifications | continuous viewport values: zoom, pan, rotation, bounds |

Continuous viewport values live on the OpenSeadragon instance and are
deliberately **not** mirrored into viewer state: mirroring them would make the
batched watcher fire at animation framerate for every subscriber on the page,
so one component's zoom readout would tax every plugin. Cadence solves that with
one option instead ([ADR 0011](adr/0011-selectors-choose-a-notification-cadence.md)):

```tsx
import { useViewerSelector } from 'triiiceratops/react';
import type { ViewerHandleSlot } from 'triiiceratops/react';

export function ZoomReadout({ handle }: { handle: ViewerHandleSlot }) {
    const zoom = useViewerSelector(
        handle,
        (state) => state.osdViewer?.viewport.getZoom() ?? 1,
        { cadence: 'frame' },
    );
    if (zoom === undefined) return null;
    return <span>{Math.round(zoom * 100)}%</span>;
}
```

`frame` is the *finer* cadence, never a coarser one: a frame-cadence projection
also wakes on state notifications, so it never serves a stale inventoried member
between animations. The frame ticker attaches lazily when an OpenSeadragon
instance appears and detaches on teardown or replacement — there is no
`requestAnimationFrame` loop, and an idle viewer with no frame-cadence selector
costs nothing.

#### What notifies

A `state`-cadence projection must read **inventoried** members — command state
and observable state. The checked-in
[state inventory](https://github.com/d-flood/triiiceratops/blob/main/packages/core/src/lib/state/state-inventory.ts)
is the authority on which members those are; every mutable member is classified
there, and an unclassified member fails CI.

Reading *through* `state.osdViewer` at `state` cadence is the one selector
mistake that fails silently — the projection simply appears frozen, because
OpenSeadragon's viewport never wakes the batched watcher. With
`config: { debug: true }` the runtime warns once and names the fix
(`cadence: 'frame'`). Reading `state.osdViewer` only to *test readiness* is
correct at `state` cadence: `osdViewer` is itself an inventoried observable
member.

## Passing the handle to a deep tree

Threading the handle through every intermediate component gets old.
`<ViewerProvider value={handle}>` publishes it to a subtree, and both hooks have
a context form that omits the handle argument:

```tsx
import {
    TriiiceratopsViewer,
    useViewer,
    useViewerHandle,
    useViewerSelector,
    ViewerProvider,
} from 'triiiceratops/react';

function CanvasLabel() {
    const canvasId = useViewerSelector((state) => state.canvasId);
    return <p>{canvasId ?? 'No canvas yet'}</p>;
}

function ZoomButtons() {
    const viewer = useViewer();
    return (
        <>
            <button type="button" onClick={() => viewer?.zoomOut()}>
                −
            </button>
            <button type="button" onClick={() => viewer?.zoomIn()}>
                +
            </button>
        </>
    );
}

export function Reader() {
    const handle = useViewerHandle();
    return (
        <ViewerProvider value={handle}>
            <header>
                <CanvasLabel />
                <ZoomButtons />
            </header>
            <TriiiceratopsViewer
                handle={handle}
                manifestId="https://example.org/manifest.json"
                style={{ display: 'block', height: '600px' }}
            />
        </ViewerProvider>
    );
}
```

`<ViewerProvider>` is a trivial value provider — ordinary React context. It gates
nothing, renders its children unconditionally, and has no fallback; reads through
the handle stay nullable. Nest a second provider to scope a second viewer, and
the nearest one wins.

Calling a hook with neither an explicit handle nor a provider above it throws
immediately with a message naming the fix, rather than returning `undefined`
forever.

## Props

Every viewer input is a typed prop. Which mechanism carries it to the element is
an implementation detail you never have to manage, but it explains the
server-rendering behavior below.

| Prop | Type | Carried as |
| :-- | :-- | :-- |
| `manifestId` | `string` | attribute (`manifest-id`) |
| `canvasId` | `string` | attribute (`canvas-id`) |
| `theme` | `string` | attribute (`theme`) |
| `manifestJson` | `string \| Record<string, any>` | property |
| `themeConfig` | `string \| ThemeConfig` | property |
| `config` | `string \| ViewerConfig` | property |
| `initialCanvasRegion` | `string \| CanvasRegion` | property |
| `plugins` | `readonly SdkPlugin[]` | property |
| `searchProvider` | `SearchProvider \| null` | property |

Everything else you pass — `className`, `style`, `id`, `data-*`, `aria-*`,
ordinary DOM attributes and DOM event handlers — is forwarded to the host
element by React, unchanged. Object- and function-valued inputs always reach the
element as JavaScript **properties**, never stringified into attributes, whether
or not the lazy registration has finished.

All tiers are **edge-triggered**: a write happens only when the prop value
differs from the value the wrapper last applied. A parent re-render with equal
props writes nothing, so it never reloads your manifest, snaps the viewport, or
restarts your plugins.

### `manifestId` and `canvasId` are uncontrolled

They are one-way instructions to the viewer, not continuously enforced bindings
— `defaultValue` + `onChange`, never `value` + `onChange`. After the user
navigates internally, re-asserting the same `canvasId` writes nothing, so the
wrapper never fights the user. There is no controlled mode.

To follow where the viewer actually is, observe it — with a selector, or with
the `onCanvasChange` / `onManifestChange` callbacks when you want to sync
something outside React state (a URL, say):

```tsx
import { useState } from 'react';
import { TriiiceratopsViewer } from 'triiiceratops/react';

export function Reader({ initialCanvasId }: { initialCanvasId: string }) {
    const [currentCanvasId, setCurrentCanvasId] = useState(initialCanvasId);

    return (
        <>
            <p>Showing {currentCanvasId}</p>
            <TriiiceratopsViewer
                manifestId="https://example.org/manifest.json"
                // An instruction, not a binding: this value is applied when it
                // changes, and internal navigation is never overwritten by it.
                canvasId={initialCanvasId}
                onCanvasChange={(snapshot) => {
                    if (snapshot.canvasId) setCurrentCanvasId(snapshot.canvasId);
                }}
                style={{ display: 'block', height: '600px' }}
            />
        </>
    );
}
```

### Keep object props stable

Property-tier inputs are compared with one uniform, one-level shallow equality:
identical by `Object.is`; or both arrays of equal length with identical elements;
or both plain objects with equal own-key sets and identical values. Deep equality
is deliberately not used, because it would make write suppression depend on the
shape of your data.

So a **nested** object rebuilt on every render is written on every render — and
writing `config` or `manifestJson` is not free. Hoist it, or memoize it:

```tsx
import { useMemo } from 'react';
import { TriiiceratopsViewer } from 'triiiceratops/react';
import type { ThemeConfig, ViewerConfig } from 'triiiceratops/react';

// Hoisted: one object for the module's lifetime.
const THEME_CONFIG: ThemeConfig = { panelBg: '#101014' };

export function Reader({ side }: { side: 'left' | 'right' }) {
    // Memoized: a new object only when what it depends on changes.
    const config = useMemo<ViewerConfig>(() => ({ toolbar: { side } }), [side]);
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            config={config}
            themeConfig={THEME_CONFIG}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
```

With `config: { debug: true }` the wrapper warns once, naming the prop, after one
property-tier input has been re-assigned an implausible number of times on one
element — so an unmemoized object prop is diagnosable instead of mysterious.

### Plugins

`plugins` takes framework-neutral [SDK plugins](plugins.md) — `readonly
SdkPlugin[]`. No Svelte types and no Svelte runtime are involved:

```tsx
import { TriiiceratopsViewer } from 'triiiceratops/react';
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

const plugins = [ImageManipulationPlugin, createPdfExportPlugin()];

export function Reader() {
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            plugins={plugins}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
```

Activation lifetime is keyed to **plugin identity**, not to the identity of the
list: re-supplying an equal list leaves running plugins completely untouched —
no teardown, no restart, no re-injected styles. The list above is hoisted anyway,
since a fresh `createPdfExportPlugin()` call per render would produce a genuinely
different plugin each time.

## Events

The custom element's channels are typed callback props. Each receives the event
**detail** directly — never a `CustomEvent` — so your code is independent of the
DOM event envelope.

| Prop | Payload |
| :-- | :-- |
| `onStateChange` | `ViewerStateSnapshot` (any inventoried change, batched) |
| `onCanvasChange` | `ViewerStateSnapshot` |
| `onManifestChange` | `ViewerStateSnapshot` |
| `onChoiceChange` | `ViewerStateSnapshot` |
| `onPluginError` | the exact `PluginError`, with a callable `retry()` |
| `onViewerError` | the exact typed `ViewerError` |

```tsx
import { TriiiceratopsViewer } from 'triiiceratops/react';

export function Reader() {
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            onCanvasChange={(snapshot) => history.replaceState(
                null,
                '',
                `?canvas=${encodeURIComponent(snapshot.canvasId ?? '')}`,
            )}
            // The original PluginError object, recovery behavior intact.
            onPluginError={(error) => error.retry()}
            onViewerError={(error) => console.error(error.message)}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
```

Changing a callback prop between renders neither leaks nor duplicates a DOM
listener: one listener per channel is installed for the element's lifetime and
always calls the current callback.

## Custom search

`searchProvider` supplies search results from your own application code instead
of a manifest-declared IIIF Content Search service. It is available through the
React wrapper, the Vue wrapper, the custom element, and Svelte alike — it is not
a Svelte-only feature.

```tsx
import { TriiiceratopsViewer } from 'triiiceratops/react';
import type { SearchProvider } from 'triiiceratops/react';

interface IndexHit {
    canvasIndex: number;
    label: string;
    match: string;
}

const searchProvider: SearchProvider = async (query, context) => {
    const response = await fetch(
        `/api/search?q=${encodeURIComponent(query)}` +
            `&manifest=${encodeURIComponent(context.manifestId)}`,
    );
    const found: IndexHit[] = await response.json();
    return found.map((hit) => ({
        canvasIndex: hit.canvasIndex,
        canvasLabel: hit.label,
        hits: [{ type: 'hit', match: hit.match }],
    }));
};

export function Reader() {
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            searchProvider={searchProvider}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
```

Pass `null` (or omit it) to use the viewer's normal IIIF Content Search service
discovery. `searchProvider` is an alternate search *source*; it is not a way to
declare a Search service URI or inject one into a manifest.

## The imperative escape hatch

When a hook is unsuitable — a test, an integration with imperative code — a
forwarded `ref` yields the same two-member `ViewerHandle` the handle publishes:

```tsx
import { useRef } from 'react';
import { TriiiceratopsViewer } from 'triiiceratops/react';
import type { TriiiceratopsViewerRef } from 'triiiceratops/react';

export function Reader() {
    const ref = useRef<TriiiceratopsViewerRef | null>(null);
    return (
        <>
            <button
                type="button"
                onClick={() => ref.current?.element.scrollIntoView()}
            >
                Scroll to viewer
            </button>
            <TriiiceratopsViewer
                ref={ref}
                manifestId="https://example.org/manifest.json"
                style={{ display: 'block', height: '600px' }}
            />
        </>
    );
}
```

`ref.current` is `null` until the viewer publishes its state and again after
unmount. It has exactly two members — `element` (the `<triiiceratops-viewer>`
host) and `state` (the readonly viewer state) — so the escape hatch stays small
and discoverable. `ref.current.state` is reference-equal to what `useViewer()`
returns.

## Server rendering

Importing `triiiceratops/react` is safe where `window`, `document`, and
`customElements` do not exist: nothing browser-only runs at module evaluation and
nothing is registered.

On the server, `<TriiiceratopsViewer>` renders an **inert host** — the
`<triiiceratops-viewer>` tag carrying the attribute tier (`manifest-id`,
`canvas-id`, `theme`) and your forwarded host attributes, and nothing else. No
shadow-DOM internals, no property-tier values, no OpenSeadragon. The client's
first render emits the identical attribute set, so hydration reuses and upgrades
the same host with no mismatch, and viewer internals initialize only in the
browser.

!!! warning "State-reading components must not render on the server"

    `useViewer()` and `useViewerSelector()` deliberately ship **no**
    `getServerSnapshot`, so React fails loudly (`Missing getServerSnapshot`)
    rather than inventing a server-side readiness value. There is no viewer, and
    therefore no viewer state, during a server render.

    Keep the components that read viewer state on the client — with your
    framework's own client-only boundary — and let `<TriiiceratopsViewer>` itself
    server-render the inert host. Because reads are nullable rather than gated,
    server and client agree with no special-cased readiness rendering.

Triiiceratops ships no meta-framework-specific components; there is no
Next.js package or adapter. The wrapper is a plain React component with
SSR-safe evaluation, and the client-only boundary is yours to place.

## When wiring goes wrong

Failures are thrown so they reach a React error boundary rather than the console.

| Error | Means |
| :-- | :-- |
| `TriiiceratopsHandleConflictError` | one handle was passed to two viewers |
| `TriiiceratopsElementVersionError` | `<triiiceratops-viewer>` is already defined by a constructor with no `viewerState` getter — usually a second, older Triiiceratops core that registered first |
| `TriiiceratopsCoreConflictError` | two different Triiiceratops core versions loaded on one page |
| `TriiiceratopsElementRegistrationError` | no `customElements` registry — the mount path ran outside a browser |

Version conflicts are diagnosed **synchronously**, right after registration:
the wrapper probes the constructor that actually owns the tag for the
`viewerState` getter. There is no timeout, deadline, retry, or
`customElements.whenDefined` poll anywhere in the path, so an incompatible page
fails fast instead of hanging.

Three additional **debug-mode** warnings exist because their failure modes are
otherwise silent:

- a property-tier prop re-assigned an implausible number of times (an
  unmemoized object);
- a handle created and never passed to a viewer, so reads stay `null` forever;
- a `state`-cadence projection that reads through `osdViewer`.

They are gated on `ViewerConfig.debug`, not on `NODE_ENV` — a production build
with `config: { debug: true }` logs them and a development build without it does
not. Debug mode is **page-level**: passing `config: { debug: true }` to any one
viewer turns these warnings on for every wrapper on the page, and the most
recently applied `debug` value wins. A `config` that omits `debug` entirely
states no opinion, so a second viewer configured for something else never
silences the first. Pass `config: { debug: false }` to turn them back off.

## Testing your own components

`triiiceratops/testing` builds a handle backed by a **real** `ViewerState` — real
commands, real batched notifications, the real selector runtime registered in the
very registry `useViewerSelector()` consults — with no DOM viewer, no custom
element, no OpenSeadragon, and no network. React, Vue, and Svelte need not be
installed for it to import.

!!! note "Run it under a DOM test environment"

    The published entry bundles a `fetch` polyfill that reaches for a `self`
    global, so importing it in bare Node fails with `ReferenceError: self is not
    defined`. Run these tests under `jsdom` or `happy-dom` — which a React test
    runner already provides — or set `globalThis.self = globalThis` first.

React consumers pass the test handle straight in wherever a `useViewerHandle()`
slot would go — no wrapper, no `.get()`:

```tsx
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test } from 'vitest';
import { createTestViewerHandle, flush } from 'triiiceratops/testing';
import type { TestViewerHandle } from 'triiiceratops/testing';
import { useViewerSelector } from 'triiiceratops/react';

// React logs "The current testing environment is not configured to support
// act(...)" unless you set this. Most React setups put it in a shared test
// setup file; Testing Library sets it for you.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;

function CanvasLabel({ handle }: { handle: TestViewerHandle }) {
    const canvasId = useViewerSelector(handle, (state) => state.canvasId);
    return <p>{canvasId ?? 'No canvas yet'}</p>;
}

let handle: TestViewerHandle | undefined;
// `dispose()` drops the underlying subscription. It is idempotent, so an
// already-disposed handle is fine here.
afterEach(() => handle?.dispose());

test('follows the viewer to a new canvas', async () => {
    handle = createTestViewerHandle();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<CanvasLabel handle={handle!} />));
    expect(container.textContent).toBe('No canvas yet');

    handle.state.setCanvas('https://example.org/canvas/2');
    // Notifications are batched: settle the flush before asserting.
    await act(async () => flush());

    expect(container.textContent).toBe('https://example.org/canvas/2');
    // Unmounting is a React update too, so it belongs inside `act` as well.
    await act(async () => root.unmount());
});
```

Swap `react-dom/client` for your own render helper or Testing Library if you
have one — the part that matters is that the handle is real state, and that a
command plus `await flush()` is how you drive it.

`createTestViewerHandle()` accepts `{ fixtures }` to seed a config, an active
locale, or already-parsed manifest JSON (through the real `setManifestData`
command — still no network). `handle.setOsdViewer(stub)` injects your own
OpenSeadragon stand-in and fires the real readiness path, which is how a
`cadence: 'frame'` projection is exercised headlessly; no OSD fake ships with it.

## What the wrapper does not do

The promise of this wrapper is **idiomatic access** to the viewer. Two things are
deliberately outside it, and it is better to know them now than mid-integration.

### Styling stops at theme tokens

Supported:

- the `theme` prop (`light`, `dark`, `teal`, `dracula`);
- the `themeConfig` prop — typed token overrides, plus a `cssVars` escape hatch
  for tokens without a typed key;
- setting the underlying `--tri-*` custom properties in your own CSS on the host
  element, since they inherit through the shadow boundary;
- everything about the **host**: `className`, `style`, layout, size, borders,
  and any CSS that treats `<triiiceratops-viewer>` as a box in your page.

See [theming](theming.md) for the full token reference.

Not supported: the viewer's shadow-DOM internals are not reachable. There is no
`::part()` surface, no way to inject a consumer stylesheet into the shadow root,
and no light-DOM styling hook for internal elements. Restyling internals is out
of scope for 1.0 — if a token you need is missing, ask for the token.

### Viewer chrome is not composable

You cannot supply React components for the viewer's toolbar, panels, or
navigation, and the component accepts no children or slot content. There is no
framework-agnostic chrome slot contract.

The supported answers, in order of how much you need:

1. **Configure the built-in chrome.** `config` turns panels, buttons, the
   gallery, the toolbar side, and plugin surfaces on and off, and applies
   reactively after mount. See [configuration](configuration.md).
2. **Build your own controls.** Application-owned React UI *outside* the viewer,
   driven by commands and selectors, is a first-class path — the handle is a
   value, so your controls can live anywhere in your tree. This is the answer for
   a custom toolbar:

    ```tsx
    import {
        TriiiceratopsViewer,
        useViewer,
        useViewerHandle,
        useViewerSelector,
        ViewerProvider,
    } from 'triiiceratops/react';

    // Hide the built-in chrome you are replacing. Hoisted, so the wrapper
    // never re-applies it.
    const CONFIG = { showCanvasNav: false, showToggle: false };

    function MyToolbar() {
        const viewer = useViewer();
        const hasPrevious = useViewerSelector((state) => state.hasPrevious);
        const hasNext = useViewerSelector((state) => state.hasNext);
        const position = useViewerSelector(
            (state) => `${state.currentCanvasIndex + 1} / ${state.canvases.length}`,
        );

        return (
            <nav className="my-toolbar">
                <button
                    type="button"
                    disabled={!hasPrevious}
                    onClick={() => viewer?.previousCanvas()}
                >
                    Previous
                </button>
                <span>{position}</span>
                <button
                    type="button"
                    disabled={!hasNext}
                    onClick={() => viewer?.nextCanvas()}
                >
                    Next
                </button>
                <button type="button" onClick={() => viewer?.zoomIn()}>
                    Zoom in
                </button>
            </nav>
        );
    }

    export function Reader() {
        const handle = useViewerHandle();
        return (
            <ViewerProvider value={handle}>
                <MyToolbar />
                <TriiiceratopsViewer
                    handle={handle}
                    manifestId="https://example.org/manifest.json"
                    config={CONFIG}
                    style={{ display: 'block', height: '600px' }}
                />
            </ViewerProvider>
        );
    }
    ```

    Anything the viewer's own UI can do, a command can do — that is the parity
    rule, and the [state inventory](#what-notifies) records which command backs
    each member.

3. **Write a plugin.** UI that must render *inside* the viewer's chrome — in a
   docked panel or an anchored flyout — is what the
   [plugin SDK](plugin-authoring.md) is for. A plugin mounts into a plain
   `HTMLElement`, so you can render it with React and it stays framework-neutral.

### Still want the raw element?

Direct custom-element integration remains fully supported and documented for
advanced hosts that want it — see
[the low-level custom element](integration.md#low-level-driving-the-custom-element-directly).
Adopting the wrapper is not required.
