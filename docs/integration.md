---
icon: lucide/code-xml
---

# Use with any framework

Triiiceratops ships the viewer as a standards-based custom element,
`<triiiceratops-viewer>`. It works the same way in plain HTML, Angular, Lit, or
any other framework — and in a Svelte app too, though Svelte hosts get a nice
native bonus instead of the custom element (its own tab below).

!!! tip "React and Vue have first-class components"

    Do not integrate the custom element by hand in React or Vue. Import the
    typed **framework wrapper** instead — it hosts this same element, registers
    it automatically, and translates its props, events, and viewer state into
    the framework's own idioms:

    - **[React guide](react.md)** — `triiiceratops/react`
    - **[Vue guide](vue.md)** — `triiiceratops/vue`

    Neither requires Svelte, at runtime or at type-check time. The custom-element
    material on this page remains fully supported as the explicitly low-level
    option, for hosts that want direct DOM control.

The element comes in two forms:

- **ESM registration** (`triiiceratops/element/register`) for projects with a
  bundler (Vite, webpack, Rollup, …).
- **Self-contained IIFE** (`triiiceratops/element`) for no-bundler pages loaded
  from a `<script>` tag.

Both register the **same tag** and expose the same properties, methods, events,
styles, and content-state behavior. Styles and themes are installed **inside the
element's shadow root** — there is no separate element stylesheet to import.

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

No-bundler pages skip this — see the HTML tab below for loading straight from
a CDN `<script>` tag.

## Use it

=== "HTML"

    Load the self-contained IIFE from a CDN or a copied file — no install, no
    build step. It bundles the element, the Svelte runtime, OpenSeadragon, and
    all styles:

    ```html
    <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>
    <script src="https://unpkg.com/@triiiceratops/plugin-image-manipulation/dist/iife.js"></script>

    <triiiceratops-viewer
        manifest-id="https://example.org/manifest.json"
        style="display: block; width: 100%; height: 100vh;"
    ></triiiceratops-viewer>

    <script>
        customElements.whenDefined('triiiceratops-viewer').then(() => {
            const viewer = document.querySelector('triiiceratops-viewer');
            const plugin = window.Triiiceratops.plugins.get(
                '@triiiceratops/plugin-image-manipulation',
            );
            viewer.plugins = [plugin];
        });
    </script>
    ```

    Using a bundler instead? Register the element with
    `import 'triiiceratops/element/register'`, then set properties directly —
    `document.querySelector('triiiceratops-viewer').manifestId = …` — no ref
    needed outside a component framework.

    - Loading the **same** core version twice is a harmless no-op.
    - Loading a **different** core version alongside one already registered
      leaves the first registration and custom element untouched and throws
      an actionable conflict error. Side-by-side multi-version loading on one
      page is not supported.
    - Registering a plugin whose name is already registered keeps the first
      factory; a version mismatch is reported as a console warning
      (first-wins), not an error.

    Runs under a strict CSP without `unsafe-eval` — see the
    [CSP recipe](csp.md).

=== "React"

    Import the component from `triiiceratops/react`. No registration import, no
    refs to assign properties through, no `JSX.IntrinsicElements` declaration:

    ```tsx
    import { TriiiceratopsViewer } from 'triiiceratops/react';
    import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

    const plugins = [ImageManipulationPlugin];
    const config = { toolbar: { side: 'right' as const } };

    export function Viewer({ manifestId }: { manifestId: string }) {
        return (
            <TriiiceratopsViewer
                manifestId={manifestId}
                plugins={plugins}
                config={config}
                onStateChange={(snapshot) => console.log('viewer state', snapshot)}
                style={{ display: 'block', width: '100%', height: '600px' }}
            />
        );
    }
    ```

    The [React guide](react.md) covers handles, selectors and cadence, typed
    events, SSR, testing, and the styling and chrome boundary.

=== "Vue"

    Import the component from `triiiceratops/vue`. No `isCustomElement`
    compiler option, no registration import, no `onMounted` property assignment:

    ```vue
    <script setup lang="ts">
    import { TriiiceratopsViewer, type SdkPlugin } from 'triiiceratops/vue';
    import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

    const plugins: readonly SdkPlugin[] = [ImageManipulationPlugin];
    const config = { toolbar: { side: 'right' as const } };
    </script>

    <template>
        <TriiiceratopsViewer
            manifest-id="https://example.org/manifest.json"
            :plugins="plugins"
            :config="config"
            style="display: block; width: 100%; height: 600px"
            @state-change="(snapshot) => console.log('viewer state', snapshot)"
        />
    </template>
    ```

    The [Vue guide](vue.md) covers template refs, selectors and cadence, typed
    emits, `<KeepAlive>`, SSR, testing, and the styling and chrome boundary.

=== "Svelte"

    A native Svelte component, no custom element involved: core's package also
    ships the viewer as a **source-distributed Svelte 5 component**. Your
    application compiles it inside its own Svelte runtime, so it tree-shakes
    normally and never bundles a second copy of Svelte.

    ```html
    <script lang="ts">
        import { TriiiceratopsViewer } from 'triiiceratops/svelte';
        // Import the design tokens + themes exactly once, anywhere in your app.
        import 'triiiceratops/style.css';
        import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
    </script>

    <div style="height: 600px;">
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            plugins={[ImageManipulationPlugin]}
        />
    </div>
    ```

    !!! important "The stylesheet is an explicit import"

        Importing the component adds **no** global CSS side effects. Styling
        comes from the one `import 'triiiceratops/style.css'`. Every rule in
        that stylesheet is scoped to the viewer root, so it cannot restyle
        your host page.

    !!! note "Works in SvelteKit out of the box"

        Bundler-neutral (no `import.meta.env` reliance) and SSR-safe — core
        server-renders cleanly and lazily loads browser-only dependencies
        (OpenSeadragon), so it hydrates without mismatch warnings. You do
        **not** need `export const ssr = false` or a browser-only guard.
        Import the stylesheet once in your root `+layout.svelte`.

From there: [add plugins](plugins.md), [configure the UI](configuration.md), or
[theme it](theming.md).

## Low-level: driving the custom element directly

Everything below is the **low-level** path. It is fully supported and is what
Angular, Lit, server-rendered templates, and vanilla JavaScript hosts use — and
it is also what React and Vue hosts can drop to when they want direct DOM
control. React and Vue applications that just want a viewer should prefer the
[React](react.md) and [Vue](vue.md) wrappers, which do all of this for you.

### Registering the element

```ts
import 'triiiceratops/element/register';
```

Registration is a side-effecting import and is idempotent. Custom-element
registration is first-wins per page: a second, different Triiiceratops core
cannot replace an already-registered tag.

### Attributes, properties, and events

- **Attributes** — `manifest-id`, `canvas-id`, `theme`. Strings only.
- **Properties** — `manifestJson`, `themeConfig`, `config`,
  `initialCanvasRegion`, `plugins`, `searchProvider`. Objects, arrays, and
  functions cannot travel through an HTML attribute, so assign them to the
  element. Assignment before the element upgrades is safe: the values are
  ported when it does.
- **Events** — `statechange`, `canvaschange`, `manifestchange`, `choicechange`,
  `pluginerror`, `viewererror`, and `viewerstateavailable`. All bubble and are
  composed, so they escape the shadow root.

```ts
import 'triiiceratops/element/register';
import type { TriiiceratopsViewerElement } from 'triiiceratops';

// The published element type declares the state bridge (`viewerState`) and
// `searchProvider`. TypeScript hosts widen it locally with the other
// property-tier inputs they assign; those exist on the element at runtime.
type ViewerHost = TriiiceratopsViewerElement & {
    manifestJson?: string | object;
    themeConfig?: string | object;
    config?: string | object;
    initialCanvasRegion?: string | object;
    plugins?: readonly unknown[];
};

const el = document.querySelector<ViewerHost>('triiiceratops-viewer')!;

el.setAttribute('manifest-id', 'https://example.org/manifest.json');
el.config = { toolbar: { side: 'right' } };

el.addEventListener('canvaschange', (event) => {
    const snapshot = (event as CustomEvent).detail;
    console.log('canvas is now', snapshot.canvasId);
});
```

### The state bridge

The element exposes the owning viewer's live per-instance `ViewerState` — the
same object plugins and framework wrappers read — through a **getter-only**
`viewerState` property, paired with a `viewerstateavailable` event:

```ts
import 'triiiceratops/element/register';
import type { TriiiceratopsViewerElement } from 'triiiceratops';

const el = document.querySelector<TriiiceratopsViewerElement>(
    'triiiceratops-viewer',
)!;

function bind(state: NonNullable<TriiiceratopsViewerElement['viewerState']>) {
    // Read on demand…
    console.log(state.canvasId);
    // …command it…
    state.nextCanvas();
    // …or subscribe. Notifications are batched and carry no payload: they mean
    // "state changed — read what you need".
    return state.subscribe(() => console.log('now at', state.canvasId));
}

// Listen THEN check: this catches state that becomes available before, during,
// or after this code runs, with no race and no polling.
el.addEventListener('viewerstateavailable', (event) => {
    bind((event as CustomEvent).detail);
});
if (el.viewerState) bind(el.viewerState);
```

Notes on the bridge:

- `viewerState` is `undefined` before the inner viewer mounts and again after
  disconnection, and it is getter-only — a host physically cannot replace it.
- `viewerstateavailable` means only that state can be bound. It does not mean a
  manifest has loaded, OpenSeadragon is ready, or a requested canvas is visible.
- Ordinary state updates do not repeat the event. A disconnection that destroys
  the inner viewer and a later reconnection produce a **new** `ViewerState` and
  a new event; rebind and drop the old one.
- For memoized, equality-gated reads over this state, `triiiceratops/selectors`
  exports the same framework-neutral selector runtime the wrappers and the
  plugin SDK use.

### `searchProvider` on the element

`searchProvider` is a property-only input — there is no reflected attribute —
and it works exactly as it does in the framework wrappers and in Svelte:

```ts
import 'triiiceratops/element/register';
import type { SearchProvider, TriiiceratopsViewerElement } from 'triiiceratops';

const el = document.querySelector<TriiiceratopsViewerElement>(
    'triiiceratops-viewer',
)!;

const searchProvider: SearchProvider = async (query, context) => [
    {
        canvasIndex: 0,
        canvasLabel: context.canvasId ?? 'Page 1',
        hits: [{ type: 'hit', match: query }],
    },
];

el.searchProvider = searchProvider;
```

Set it to `null` (or leave it unset) to use the viewer's normal IIIF Content
Search service discovery.

### Hand-wiring React (low-level)

Only for hosts that deliberately want the raw element — for example, an existing
integration being migrated. New React code should use
[`triiiceratops/react`](react.md).

```jsx
import { useEffect, useRef } from 'react';
import 'triiiceratops/element/register';
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

export function Viewer({ manifestId }) {
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.manifestId = manifestId;
        el.plugins = [ImageManipulationPlugin];
        el.config = { toolbar: { side: 'right' } };
        const onStateChange = (e) => console.log('viewer state', e.detail);
        el.addEventListener('statechange', onStateChange);
        return () => el.removeEventListener('statechange', onStateChange);
    }, [manifestId]);

    return (
        <triiiceratops-viewer
            ref={ref}
            style={{ display: 'block', width: '100%', height: '600px' }}
        />
    );
}
```

TypeScript hosts taking this path must declare the tag in
`JSX.IntrinsicElements` (or set properties through a typed ref, as above) to
satisfy the compiler. The wrapper removes that requirement.

### Hand-wiring Vue (low-level)

Only for hosts that deliberately want the raw element. New Vue code should use
[`triiiceratops/vue`](vue.md).

Tell the compiler the tag is a custom element so it does not try to resolve it
as a Vue component, then set complex values as properties through a template
ref:

```ts
// vite.config.ts
vue({
    template: {
        compilerOptions: {
            isCustomElement: (tag) => tag === 'triiiceratops-viewer',
        },
    },
});
```

```vue
<script setup>
import { onMounted, ref, watch } from 'vue';
import 'triiiceratops/element/register';
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

const props = defineProps(['manifestId']);
const viewer = ref(null);

function sync() {
    viewer.value.manifestId = props.manifestId;
    viewer.value.plugins = [ImageManipulationPlugin];
    viewer.value.config = { toolbar: { side: 'right' } };
}

onMounted(() => {
    sync();
    viewer.value.addEventListener('statechange', (e) => {
        console.log('viewer state', e.detail);
    });
});
watch(() => props.manifestId, sync);
</script>

<template>
    <triiiceratops-viewer ref="viewer" style="display: block; width: 100%; height: 600px" />
</template>
```

The wrapper removes the `isCustomElement` configuration, the property
assignments, and the manual listeners.

## Verified against the packed package

CI runs packed-consumer fixtures across Chromium, Firefox, and WebKit for
every host above: `wc-esm` (bundler ESM registration), `plain-html-iife` and
`plugin-image-manip-iife` (script tags, core and a plugin IIFE loaded in
**both** script orders), `svelte-vite` (the native Svelte component), and
`sveltekit-ssr` (server-rendered, then hydrated, without mismatch warnings).
React 19 and Vue 3.5 consumer fixtures install the same packed artifacts with
no Svelte dependency and no Svelte Vite plugin, and every code sample on this
site is type-checked against those tarballs.
