---
icon: lucide/code-xml
---

# Use with any framework

Triiiceratops ships the viewer as a standards-based custom element,
`<triiiceratops-viewer>`. It works the same way in React, Vue, Angular, plain
HTML, or any other framework — and in a Svelte app too, though Svelte hosts get
a nice native bonus instead of the custom element (its own tab below).

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

    Using a bundler instead? Register the element the same way React and Vue
    do (`import 'triiiceratops/element/register'`), then set properties
    directly — `document.querySelector('triiiceratops-viewer').manifestId = …` —
    no ref needed outside a component framework.

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

    Register the element once, then set complex values (manifest JSON,
    `plugins`, `config`) as properties through a ref, since React only writes
    plain strings as HTML attributes.

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

    TypeScript hosts: declare the tag in `JSX.IntrinsicElements` (or just set
    properties through a typed ref, as above) to satisfy the compiler.

=== "Vue"

    Tell the compiler the tag is a custom element so it doesn't try to resolve
    it as a Vue component, then set complex values as properties through a
    template ref:

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

=== "Svelte"

    A native Svelte component, no custom element involved: core's package also
    ships the viewer as a **source-distributed Svelte 5 component**. Your
    application compiles it inside its own Svelte runtime, so it tree-shakes
    normally and never bundles a second copy of Svelte.

    ```html
    <script lang="ts">
        import { TriiiceratopsViewer } from 'triiiceratops';
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

## Verified against the packed package

CI runs packed-consumer fixtures across Chromium, Firefox, and WebKit for
every host above: `wc-esm` (bundler ESM registration, exercised by React and
Vue), `plain-html-iife` and `plugin-image-manip-iife` (script tags, core and a
plugin IIFE loaded in **both** script orders), `svelte-vite` (the native
Svelte component), and `sveltekit-ssr` (server-rendered, then hydrated,
without mismatch warnings).
