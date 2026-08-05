---
icon: lucide/code-xml
description: "Drop the <triiiceratops-viewer> custom element into plain HTML, a Django or WordPress template, or any framework that can render a tag."
---

# Any framework (web component)

Triiiceratops ships the viewer as a standards-based custom element,
`<triiiceratops-viewer>`. If your stack can put a tag on a page, it can host the
viewer — no adapter required.

**This is your page if you are using** Angular, Lit, Solid, Svelte-free vanilla
JavaScript, Alpine.js, htmx, Astro, Ember, jQuery, a server-rendered template
language (Django, Rails, Laravel, ASP.NET, PHP), a static-site generator, or
**WordPress** — as a block, a shortcode, or a raw HTML widget. Every one of
those is the same two steps: get the script onto the page, then set attributes
and properties on the tag.

!!! tip "React, Vue, and Svelte have first-class components"

    Those three have dedicated guides, and you should use them rather than the
    element directly — each translates props, events, and viewer state into its
    framework's own idioms:

    - **[React guide](react.md)** — `triiiceratops/react`
    - **[Vue guide](vue.md)** — `triiiceratops/vue`
    - **[Svelte guide](svelte.md)** — `triiiceratops/svelte`

    React and Vue require no Svelte, at runtime or at type-check time. The
    custom-element material here stays fully supported for hosts that want
    direct DOM control, including a React or Vue app that deliberately drops
    down to it — see [hand-wiring](#hand-wiring-a-component-framework).

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

Load the self-contained IIFE from a CDN or a copied file — no install, no build
step. It bundles the element, the Svelte runtime, OpenSeadragon, and all styles:

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

That snippet is the entire integration for a WordPress custom-HTML block, a
Django or Rails template, or any page you can add a `<script>` tag to.

Using a bundler instead? Register the element with
`import 'triiiceratops/element/register'`, then set properties directly —
`document.querySelector('triiiceratops-viewer').manifestId = …` — no ref needed
outside a component framework.

- Loading the **same** core version twice is a harmless no-op.
- Loading a **different** core version alongside one already registered leaves
  the first registration and custom element untouched and throws an actionable
  conflict error. Side-by-side multi-version loading on one page is not
  supported.
- Registering a plugin whose name is already registered keeps the first factory;
  a version mismatch is reported as a console warning (first-wins), not an
  error.

Runs under a strict CSP without `unsafe-eval` — see the [CSP recipe](csp.md).

From there: [add plugins](plugins.md), [configure the UI](configuration.md), or
[theme it](theming.md).

## Driving the element directly

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

## Hand-wiring a component framework

The two recipes below exist only for hosts that deliberately want the raw
element — most often an existing integration mid-migration. New React and Vue
code should use the [React](react.md) and [Vue](vue.md) wrappers, which do all of
this for you and are the supported path.

### Hand-wiring React

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

### Hand-wiring Vue

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

CI runs packed-consumer fixtures across Chromium, Firefox, and WebKit for both
element forms on this page: `wc-esm` (bundler ESM registration) and
`plain-html-iife` plus `plugin-image-manip-iife` (script tags, core and a plugin
IIFE loaded in **both** script orders). Every code sample on this site is also
type-checked against those same tarballs.
