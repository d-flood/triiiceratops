---
icon: simple/vuedotjs
---

# Vue

`triiiceratops/vue` is a **framework wrapper**: a real Vue 3.5 component that
hosts the Triiiceratops custom element and translates its lifecycle, properties,
events, and viewer state into Vue idioms. It does not implement or own a second
viewer — there is exactly one viewer implementation, behind the custom-element
boundary.

That boundary is also where Svelte stays. You do **not** install Svelte, add a
Svelte plugin to Vite, or write `compilerOptions.isCustomElement` anywhere:
`<TriiiceratopsViewer>` is a render-function component, so the raw
`<triiiceratops-viewer>` tag never reaches Vue's template compiler.
`triiiceratops/vue` is precompiled JavaScript plus declarations that resolve with
**no `svelte` package installed**.

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

Vue 3.5 is an **optional peer dependency** — installing Triiiceratops for a
different integration never pulls Vue in, and Vue is never bundled into the
package.

## Your first viewer

```vue
<script setup lang="ts">
import { TriiiceratopsViewer } from 'triiiceratops/vue';
</script>

<template>
    <TriiiceratopsViewer
        manifest-id="https://example.org/manifest.json"
        style="display: block; height: 600px"
    />
</template>
```

That is the whole integration — no `vite.config.ts` change, no registration
import, no `onMounted` block assigning properties to a ref. Some things worth
knowing right away:

- **Registration is automatic.** The first `<TriiiceratopsViewer>` to mount in
  the browser lazily imports and registers the self-contained custom element.
  The work is memoized and shared across every instance on the page.
- **The wrapper renders exactly one element** — the `<triiiceratops-viewer>`
  host, and nothing else. No layout wrapper, so adopting it changes no sizing or
  CSS. Give the host a height, as above.
- **It has no slots.** The viewer's chrome is not composable from Vue
  components. See [what the wrapper does not do](#what-the-wrapper-does-not-do).
- **`class`, `style`, `id`, `data-*`, and ordinary attributes fall through** to
  the host element. `inheritAttrs` is disabled and the render function spreads
  `attrs` deliberately, so attribute inheritance stays predictable even though
  the component renders a single element.
- **Styles are bundled inside the element's shadow root.** There is no
  stylesheet to import.

## The template ref is the handle

Vue already has the thing a viewer handle needs to be — a stable,
consumer-owned box the component fills in — so this wrapper adds no handle API
of its own. An ordinary template ref *is* the handle:

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');

// Reactive read: a `computed` that updates when the selected value changes.
const canvasId = useViewerSelector(viewer, (state) => state.canvasId);

// Imperative command, straight through the ref.
function next(): void {
    viewer.value?.state?.nextCanvas();
}
</script>

<template>
    <p>{{ canvasId ?? 'No canvas yet' }}</p>
    <button type="button" @click="next">Next canvas</button>
    <TriiiceratopsViewer
        ref="viewer"
        manifest-id="https://example.org/manifest.json"
        style="display: block; height: 600px"
    />
</template>
```

If you already use `useTemplateRef` and VueUse composables, nothing here is new
machinery — the ref is the handle and the composables take it.

!!! note "Why `viewer.value?.state?.…` has two optional chains"

    `viewer.value` is `null` before mount and after unmount — that is Vue's
    template-ref contract. `state` is additionally `undefined` in the window
    between "Vue mounted the host" and "the custom element finished mounting its
    viewer", so the exposed type is

    ```ts
    interface TriiiceratopsViewerInstance {
        readonly element: TriiiceratopsViewerElement;
        readonly state: ReadonlyViewerState | undefined;
    }
    ```

    Nothing is gated or withheld to hide that window; `undefined` is the honest
    state of the world, and the second `?.` is how you handle it. The interface is
    derived from the shared `ViewerHandle` contract so the two cannot drift.

**The ref is optional.** A viewer that nothing reads from needs no ref at all —
the first example above has none.

**Your UI can live anywhere.** The ref is a value, so controls can be siblings,
ancestors, nested inside your own layout components, or in a completely
different part of the tree. The wrapper imposes no markup structure.

**One ref per viewer.** Two viewers on a page means two template refs; their
state, selectors, commands, emits, and handles are completely isolated. Putting
the *same* ref on a second `<TriiiceratopsViewer>` throws
`TriiiceratopsHandleConflictError` naming both elements, because ambiguous
ownership would silently make every read follow whichever viewer mounted last.
Two shapes are exempt, because sharing is the intent rather than a mistake: a
ref inside `v-for` (Vue collects every match into an array) and a callback ref
(`:ref="(el) => …"`, where you decide what to do with each value).

### `useViewer()` vs `useViewerSelector()`

| | `useViewer(handle)` | `useViewerSelector(handle, projection, options?)` |
| :-- | :-- | :-- |
| Returns | `ComputedRef<ReadonlyViewerState \| undefined>` | `ComputedRef<T \| undefined>` |
| Subscribes to state | **No** | Yes |
| Invalidates when | the viewer binds, rebinds, or unmounts | the selected value changes |
| Use it for | commands, one-shot reads inside handlers | anything you render |

Both also have a context form that omits the handle — see
[passing the handle to a deep tree](#passing-the-handle-to-a-deep-tree).

Both are a `computed`, so both unwrap automatically in templates.
`useViewer()` gives you the very same live `ViewerState` object the element owns
— no facade, no `Proxy`, no copy — with the four lifecycle-plumbing methods
(`setEventTarget`, `setViewerElement`, `destroy`, `destroyAllPlugins`) hidden so
autocomplete offers only supported operations. It is reference-equal to
`viewer.value?.state`.

Reading a notifying member off that object does **not** subscribe to it:

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewer,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
const state = useViewer(viewer);

// Commands: correct — read at the moment the user clicks.
const zoomIn = (): void => state.value?.zoomIn();
const search = (query: string): void => void state.value?.search(query);
</script>

<template>
    <button type="button" @click="zoomIn">Zoom in</button>
    <button type="button" @click="search('lorem')">Search</button>
    <TriiiceratopsViewer
        ref="viewer"
        manifest-id="https://example.org/manifest.json"
        style="display: block; height: 600px"
    />
</template>
```

Rendering `state.canvasId` from `useViewer()` would show the value at binding
time and never update. Use `useViewerSelector()` for anything you render.

## Reactive reads

`useViewerSelector()` is one generic, memoized, equality-gated projection. `T` is
inferred from the projection:

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
// ComputedRef<boolean | undefined>, inferred.
const galleryOpen = useViewerSelector(
    viewer,
    (state) => state.showThumbnailGallery,
);
</script>

<template>
    <span>{{ galleryOpen ? 'Gallery open' : 'Gallery closed' }}</span>
    <TriiiceratopsViewer
        ref="viewer"
        manifest-id="https://example.org/manifest.json"
        style="display: block; height: 600px"
    />
</template>
```

### Equality gating

A projection is memoized twice over. Within one viewer notification it is
computed once, and across notifications the equality gate decides: when a
recompute produces a value that satisfies `equals`, the projection keeps
returning the **previous reference**, so the `computed` stays clean and nothing
downstream re-renders.

`equals` defaults to `Object.is`. A projection that builds a fresh object or
array on every run is never `Object.is`-equal to its predecessor, so give those
an `equals`:

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
const position = useViewerSelector(
    viewer,
    (state) => ({
        index: state.currentCanvasIndex,
        total: state.canvases.length,
    }),
    { equals: (a, b) => a.index === b.index && a.total === b.total },
);
</script>

<template>
    <span v-if="position">{{ position.index + 1 }} / {{ position.total }}</span>
    <TriiiceratopsViewer
        ref="viewer"
        manifest-id="https://example.org/manifest.json"
        style="display: block; height: 600px"
    />
</template>
```

**All selectors for one viewer share one underlying subscription.** Adding
selector components does not multiply `ViewerState.subscribe` registrations.

**Projection failures reach Vue's own error handling.** A projection or equality
function that throws does so during your component's evaluation, so it reaches
`onErrorCaptured` and `app.config.errorHandler`. It is never swallowed, never
converted into a `viewer-error` or `plugin-error` emit, and never served as a
stale selected value.

### Vue reactive dependencies are tracked

Because the projection runs inside a `computed`, any `ref` or `reactive` value
it reads is tracked automatically. You never add a manual watcher to keep a
projection current with your own state:

```vue
<script setup lang="ts">
import { ref, useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
const showIndex = ref(false);

// Two dependencies, one composable: the viewer's canvas AND `showIndex`.
// Toggling `showIndex` invalidates the selection with no watcher of your own.
const label = useViewerSelector(viewer, (state) =>
    showIndex.value
        ? `Canvas ${state.currentCanvasIndex + 1}`
        : (state.canvasId ?? 'No canvas yet'),
);
</script>

<template>
    <label>
        <input v-model="showIndex" type="checkbox" />
        Show index
    </label>
    <p>{{ label }}</p>
    <TriiiceratopsViewer
        ref="viewer"
        manifest-id="https://example.org/manifest.json"
        style="display: block; height: 600px"
    />
</template>
```

### Selector cadence

The `cadence` option chooses which notification wakes a projection: the default
`state` for anything in the viewer's state inventory, and `frame` for continuous
OpenSeadragon viewport values (zoom, pan, rotation, bounds) that are deliberately
not mirrored into viewer state. [Selector cadence](configuration.md#selector-cadence)
explains the split and why it exists; the Vue call is one option:

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    useViewerSelector,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
const zoom = useViewerSelector(
    viewer,
    (state) => state.osdViewer?.viewport.getZoom() ?? 1,
    { cadence: 'frame' },
);
</script>

<template>
    <span v-if="zoom !== undefined">{{ Math.round(zoom * 100) }}%</span>
    <TriiiceratopsViewer
        ref="viewer"
        manifest-id="https://example.org/manifest.json"
        style="display: block; height: 600px"
    />
</template>
```

Reading *through* `state.osdViewer` at the default `state` cadence is the one
selector mistake that fails silently — the projection simply appears frozen. See
[what notifies](configuration.md#what-notifies) for the inventory that decides
which members a `state`-cadence projection may read.

## Passing the handle to a deep tree

`provideViewer(viewer)` publishes the handle to the whole subtree, and both
composables have a context form that omits the handle argument:

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue';
import {
    provideViewer,
    TriiiceratopsViewer,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';
import CanvasLabel from './CanvasLabel.vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
provideViewer(viewer);
</script>

<template>
    <header><CanvasLabel /></header>
    <TriiiceratopsViewer
        ref="viewer"
        manifest-id="https://example.org/manifest.json"
        style="display: block; height: 600px"
    />
</template>
```

```vue
<!-- CanvasLabel.vue -->
<script setup lang="ts">
import { useViewer, useViewerSelector } from 'triiiceratops/vue';

const canvasId = useViewerSelector((state) => state.canvasId);
const state = useViewer();
</script>

<template>
    <p>{{ canvasId ?? 'No canvas yet' }}</p>
    <button type="button" @click="state?.nextCanvas()">Next</button>
</template>
```

`provideViewer` gates nothing and has no fallback; reads through the handle stay
nullable. Providing again in a nested component scopes a second viewer, and the
nearest one wins.

A `<ViewerProvider :value="viewer">` component is also exported, for parity with
`triiiceratops/react` and for teams who prefer the boundary visible in the
template. Vue does not need it — `provideViewer` in `setup` is enough.

!!! warning "A component's own `provide()` is not visible to its own `inject()`"

    Only descendants resolve the provided handle. In the component that calls
    `provideViewer(viewer)`, keep passing `viewer` explicitly to composables in
    that same `setup`.

Calling a composable with neither an explicit handle nor a provided one throws
immediately with a message naming the fix, rather than returning `undefined`
forever.

## Props

Every viewer input is a typed prop, usable with Vue's normal kebab-case in
templates.

| Prop | Type | Carried as |
| :-- | :-- | :-- |
| `manifest-id` | `string` | attribute (`manifest-id`) |
| `canvas-id` | `string` | attribute (`canvas-id`) |
| `theme` | `string` | attribute (`theme`) |
| `manifest-json` | `string \| Record<string, any>` | property |
| `theme-config` | `string \| ThemeConfig` | property |
| `config` | `string \| ViewerConfig` | property |
| `initial-canvas-region` | `string \| CanvasRegion` | property |
| `plugins` | `readonly SdkPlugin[]` | property |
| `search-provider` | `SearchProvider \| null` | property |

Anything not in that table is not a viewer input: it lands in `attrs` and is
forwarded to the host element untouched. Object- and function-valued inputs
always reach the element as JavaScript **properties**, never stringified into
attributes, whether or not the lazy registration has finished.

All tiers are **edge-triggered**: a write happens only when the prop value
differs from the value the wrapper last applied. A parent re-render with equal
props writes nothing, so it never reloads your manifest, snaps the viewport, or
restarts your plugins.

### `manifest-id` and `canvas-id` are uncontrolled

They are one-way instructions to the viewer, not continuously enforced bindings.
There is no `v-model` for them, deliberately: after the user navigates
internally, re-asserting the same `canvas-id` writes nothing, so the wrapper
never fights the user.

To follow where the viewer actually is, observe it — with a selector, or with
the `@canvas-change` / `@manifest-change` emits when you want to sync something
outside Vue state (a router, say):

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
    TriiiceratopsViewer,
    type ViewerStateSnapshot,
} from 'triiiceratops/vue';

const initialCanvasId = 'https://example.org/canvas/1';
const currentCanvasId = ref(initialCanvasId);

function onCanvasChange(snapshot: ViewerStateSnapshot): void {
    if (snapshot.canvasId) currentCanvasId.value = snapshot.canvasId;
}
</script>

<template>
    <p>Showing {{ currentCanvasId }}</p>
    <TriiiceratopsViewer
        manifest-id="https://example.org/manifest.json"
        :canvas-id="initialCanvasId"
        style="display: block; height: 600px"
        @canvas-change="onCanvasChange"
    />
</template>
```

### Use `shallowRef` for object props

Property-tier inputs are compared with one uniform, one-level shallow equality:
identical by `Object.is`; or both arrays of equal length with identical elements;
or both plain objects with equal own-key sets and identical values. Deep equality
is deliberately not used.

Two consequences in Vue:

- A **nested** object rebuilt on every render is written on every render, and
  writing `config` or `manifest-json` is not free. Hoist it or keep it in a ref.
- Use `shallowRef`, not `ref`, for object-valued viewer inputs. A deep `ref`
  hands the wrapper a `reactive` **proxy** rather than your object, so identity
  no longer matches what you passed.

```vue
<script setup lang="ts">
import { shallowRef } from 'vue';
import { TriiiceratopsViewer, type ViewerConfig } from 'triiiceratops/vue';

// shallowRef: the wrapper receives this exact object, not a reactive proxy.
const config = shallowRef<ViewerConfig>({ toolbar: { side: 'right' } });

function moveToolbar(side: 'left' | 'right'): void {
    // Replace the object; do not mutate it in place.
    config.value = { toolbar: { side } };
}
</script>

<template>
    <button type="button" @click="moveToolbar('left')">Toolbar left</button>
    <TriiiceratopsViewer
        manifest-id="https://example.org/manifest.json"
        :config="config"
        style="display: block; height: 600px"
    />
</template>
```

With `config: { debug: true }` the wrapper warns once, naming the prop, after one
property-tier input has been re-assigned an implausible number of times on one
element — so an accidentally unstable object prop is diagnosable instead of
mysterious.

### Plugins

`plugins` takes framework-neutral [SDK plugins](plugins.md) — `readonly
SdkPlugin[]`, with no Svelte types or Svelte runtime involved. The
[plugins guide](plugins.md#adding-a-plugin-to-your-viewer) has the Vue example.

Activation lifetime is keyed to **plugin identity**, not to the identity of the
list: re-supplying an equal list leaves running plugins completely untouched — no
teardown, no restart, no re-injected styles. Build the list once outside any
reactive re-evaluation anyway, since a fresh `createPdfExportPlugin()` call would
produce a genuinely different plugin each time.

## Emits

The custom element's channels are typed emits, usable with Vue's normal template
casing. Each carries the event **detail** directly — never a `CustomEvent` — so
your code is independent of the DOM event envelope.

| Emit | Payload |
| :-- | :-- |
| `@state-change` | `ViewerStateSnapshot` (any inventoried change, batched) |
| `@canvas-change` | `ViewerStateSnapshot` |
| `@manifest-change` | `ViewerStateSnapshot` |
| `@choice-change` | `ViewerStateSnapshot` |
| `@plugin-error` | the exact `PluginError`, with a callable `retry()` |
| `@viewer-error` | the exact typed `ViewerError` |

```vue
<script setup lang="ts">
import {
    TriiiceratopsViewer,
    type PluginError,
    type ViewerError,
    type ViewerStateSnapshot,
} from 'triiiceratops/vue';

function syncUrl(snapshot: ViewerStateSnapshot): void {
    history.replaceState(
        null,
        '',
        `?canvas=${encodeURIComponent(snapshot.canvasId ?? '')}`,
    );
}
// The original PluginError object, recovery behavior intact.
const retry = (error: PluginError): void => error.retry();
const report = (error: ViewerError): void => console.error(error.message);
</script>

<template>
    <TriiiceratopsViewer
        manifest-id="https://example.org/manifest.json"
        style="display: block; height: 600px"
        @canvas-change="syncUrl"
        @plugin-error="retry"
        @viewer-error="report"
    />
</template>
```

## Custom search

The `search-provider` prop supplies search results from your own application code
instead of a manifest-declared IIIF Content Search service. It behaves the same in
every host, so it is documented once with a Vue tab in
[custom search providers](configuration.md#custom-search-providers).

## The imperative escape hatch

The same template ref is the escape hatch. It exposes exactly two members —
`element` (the `<triiiceratops-viewer>` host) and `state` (the readonly viewer
state) — so it stays small and discoverable:

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue';
import {
    TriiiceratopsViewer,
    type TriiiceratopsViewerInstance,
} from 'triiiceratops/vue';

const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');

function scrollToViewer(): void {
    viewer.value?.element.scrollIntoView();
}
</script>

<template>
    <button type="button" @click="scrollToViewer">Scroll to viewer</button>
    <TriiiceratopsViewer
        ref="viewer"
        manifest-id="https://example.org/manifest.json"
        style="display: block; height: 600px"
    />
</template>
```

`viewer.value.state` is reference-equal to what `useViewer()` returns and to the
element's own `viewerState`.

## Server rendering

Importing `triiiceratops/vue` is safe where `window`, `document`, and
`customElements` do not exist: nothing browser-only runs at module evaluation and
nothing is registered.

On the server, `<TriiiceratopsViewer>` renders an **inert host** — the
`<triiiceratops-viewer>` tag carrying the attribute tier (`manifest-id`,
`canvas-id`, `theme`) and your forwarded host attributes, and nothing else. No
shadow-DOM internals, no property-tier values, no OpenSeadragon. The client's
first render emits the identical attribute set, so hydration reuses and upgrades
the same host with no mismatch, and viewer internals initialize only in the
browser.

State-reading components server-render harmlessly, which is a real difference
from the React wrapper: there is no viewer during a server render, so the refs
from `useViewer()` and `useViewerSelector()` hold `undefined` and your not-ready
branch is what gets serialized. Because reads are nullable rather than gated, the
client's first render agrees with it and hydration reports no mismatch — write
that branch as markup the client can also produce.

Triiiceratops ships no meta-framework-specific components; there is no Nuxt
module. The wrapper is a plain Vue component with SSR-safe evaluation.

## `<KeepAlive>`

`<KeepAlive>` deactivation detaches the element from the document for long
enough that the custom element destroys its inner viewer, and reactivation
mounts a brand-new one. Both halves of that matter:

- **The wrapper rebinds cleanly.** On reactivation the element publishes a new
  `ViewerState`; the wrapper atomically disposes the previous selector runtime,
  publishes the new binding, and rebuilds the handle. Every composable rewires
  itself — selectors, commands, and the template ref all keep working, and no
  consumer is ever left holding a projection subscribed to a disposed runtime.
- **Viewer state does not survive.** The manifest, canvas, viewport, and plugin
  state from before deactivation are gone, because the object that held them was
  destroyed. Restoring it is not attempted: that would require the wrapper to own
  a second state surface, which it deliberately does not.

With `config: { debug: true }`, the wrapper warns once when it sees a second
`ViewerState`, because the state loss is otherwise completely silent.

If a round trip must preserve where the user was, keep that in your own state and
re-supply it — for example, remember the last `@canvas-change` snapshot's
`canvasId` and pass it back as `:canvas-id`.

## When wiring goes wrong

Failures are thrown from a watcher so they reach `onErrorCaptured` and
`app.config.errorHandler` rather than the console.

| Error | Means |
| :-- | :-- |
| `TriiiceratopsElementVersionError` | `<triiiceratops-viewer>` is already defined by a constructor with no `viewerState` getter — usually a second, older Triiiceratops core that registered first |
| `TriiiceratopsCoreConflictError` | two different Triiiceratops core versions loaded on one page |
| `TriiiceratopsElementRegistrationError` | no `customElements` registry — the mount path ran outside a browser |
| `TriiiceratopsHandleConflictError` | one template ref was put on two viewers |

The handle conflict is raised from the second viewer's mount hook, so it reaches
`onErrorCaptured` and `app.config.errorHandler` like the others. It is the same
error, with the same message, that `triiiceratops/react` raises when one
`useViewerHandle()` slot is passed to two viewers — see
[One ref per viewer](#the-template-ref-is-the-handle).

Version conflicts are diagnosed **synchronously**, right after registration: the
wrapper probes the constructor that actually owns the tag for the `viewerState`
getter. There is no timeout, deadline, retry, or `customElements.whenDefined`
poll anywhere in the path, so an incompatible page fails fast instead of hanging.

Further failure modes are silent by design and surface only under
`config: { debug: true }` — unstable property-tier props, a `state`-cadence
projection reading through `osdViewer`, and the `<KeepAlive>` state loss above.
See [debug diagnostics](configuration.md#debug-diagnostics).

## Testing your own components

`triiiceratops/testing` builds a handle backed by a **real** `ViewerState` — real
commands, real batched notifications, the real selector runtime `useViewerSelector()`
consults — with no DOM viewer, no custom element, no OpenSeadragon, and no
network. Run it under `jsdom` or `happy-dom` — which a Vue test runner already
provides — because the published entry bundles a `fetch` polyfill that reaches for
a `self` global, so bare Node fails with `ReferenceError: self is not defined`
(or set `globalThis.self = globalThis` first).

Wrap the handle in a `shallowRef` and pass it where a template ref would go:

```ts
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue';
import { afterEach, expect, test } from 'vitest';
import { createTestViewerHandle, flush } from 'triiiceratops/testing';
import type { TestViewerHandle } from 'triiiceratops/testing';
import { useViewerSelector } from 'triiiceratops/vue';

let handle: TestViewerHandle | undefined;
// `dispose()` drops the underlying subscription. It is idempotent, so an
// already-disposed handle is fine here.
afterEach(() => handle?.dispose());

test('follows the viewer to a new canvas', async () => {
    handle = createTestViewerHandle();
    // shallowRef, NOT ref: a deep ref would hand the composable a reactive
    // proxy of the handle, and identity comparisons would stop holding.
    const viewer = shallowRef(handle);

    const CanvasLabel = defineComponent({
        setup() {
            const canvasId = useViewerSelector(viewer, (s) => s.canvasId);
            return () => h('p', canvasId.value ?? 'No canvas yet');
        },
    });

    const container = document.createElement('div');
    const app = createApp(CanvasLabel);
    app.mount(container);
    expect(container.textContent).toBe('No canvas yet');

    handle.state.setCanvas('https://example.org/canvas/2');
    // Notifications are batched; then let Vue re-render.
    await flush();
    await nextTick();

    expect(container.textContent).toBe('https://example.org/canvas/2');
    app.unmount();
});
```

`createTestViewerHandle()` accepts `{ fixtures }` to seed a config, an active
locale, or already-parsed manifest JSON (through the real `setManifestData`
command — still no network). `handle.setOsdViewer(stub)` injects your own
OpenSeadragon stand-in and fires the real readiness path, which is how a
`cadence: 'frame'` projection is exercised headlessly; no OSD fake ships with it.

## What the wrapper does not do

The promise of this wrapper is **idiomatic access** to the viewer. Two limits are
deliberately outside it, and both are shared by every host rather than being
Vue-specific:

- **Styling stops at theme tokens.** `theme`, `theme-config`, and the `--tri-*`
  custom properties are the whole surface; the shadow-DOM internals are not
  reachable. Everything about the *host* element — `class`, `style`, layout, size,
  borders — is yours as usual, and scoped styles (`<style scoped>`) reach the host
  and nothing inside it, which is the same boundary stated a different way. See
  [theming](theming.md).
- **Viewer chrome is not composable.** You cannot supply Vue components for the
  toolbar, panels, or navigation, and the component has no slots.
  [Building your own chrome](configuration.md#building-your-own-chrome) covers the
  three supported answers, with a Vue custom-toolbar example.

Direct custom-element integration also remains fully supported for hosts that
want it — see [driving the element directly](integration.md#driving-the-element-directly).
Adopting the wrapper is not required.
