---
icon: lucide/rocket
---

# Triiiceratops IIIF Viewer

A modern, lightweight, **framework-agnostic** IIIF viewer. Use the typed React
or Vue component, drop the standards-based web component into plain HTML or any
other frontend, or use the native Svelte component if that's your stack.

<!-- Absolute URL, not a relative `./viewer/` link: the demo is published at a
stable, unversioned path (see docs-publish.mjs) because IIIF cookbook recipes
link to it directly. A relative link would resolve inside the current
docs version directory, where the demo no longer lives. -->
[**View Live Demo**](https://d-flood.github.io/triiiceratops/viewer/){ .md-button .md-button--primary }

!!! info "This documentation describes the Triiiceratops 1.0 release line"

    Core is published as `triiiceratops`; the plugin SDK and first-party plugins
    are published under the `@triiiceratops` npm scope and versioned
    independently.

## Start here

Pick your stack. Each tab is a complete, working viewer; the guide behind it is
the one place that stack's integration is documented.

=== "HTML"

    No install and no build step — one script tag from a CDN:

    ```html
    <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>

    <triiiceratops-viewer
        manifest-id="https://iiif.wellcomecollection.org/presentation/v2/b18035723"
        style="display: block; width: 100%; height: 100vh;"
    ></triiiceratops-viewer>
    ```

    That is the whole integration — styles and themes ship inside the element.
    The same custom element is how you use the viewer from **Angular, Lit,
    Solid, Alpine, htmx, Django or Rails templates, and WordPress**.

    [Any framework guide](integration.md){ .md-button }

=== "React"

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

    Typed props, typed callbacks, automatic element registration, and hooks for
    viewer state.

    [React guide](react.md){ .md-button }

=== "Vue"

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

    Typed props, typed emits, automatic element registration, and composables
    for viewer state.

    [Vue guide](vue.md){ .md-button }

=== "Svelte"

    ```html
    <script lang="ts">
        import { TriiiceratopsViewer } from 'triiiceratops/svelte';
        import 'triiiceratops/style.css'; // once, anywhere in your app
    </script>

    <!-- Container must have height -->
    <div style="height: 600px;">
        <TriiiceratopsViewer manifestId="https://example.org/manifest.json" />
    </div>
    ```

    A native Svelte 5 component — no custom element in the way.

    [Svelte guide](svelte.md){ .md-button }

!!! tip "No Svelte in your React or Vue app"

    The framework wrappers host the same custom element every other integration
    uses, so Svelte and its runtime stay behind that boundary. You add no Svelte
    dependency, no Svelte Vite plugin, and no custom-element tag configuration —
    and the published type declarations for `triiiceratops/react` and
    `triiiceratops/vue` resolve with no `svelte` package installed.

## Which entry point do I import from?

Every entry below except `triiiceratops/svelte` is **framework-neutral**: nothing
reachable from it needs the optional `svelte` peer, at runtime or at type-check
time. Import from the one that matches your framework and you never think about
this again.

| Entry | For | Needs `svelte` installed |
| :--- | :--- | :--- |
| `triiiceratops/element/register` | plain HTML / any framework | no |
| `triiiceratops/react` | React 19 apps | no |
| `triiiceratops/vue` | Vue 3 apps | no |
| `triiiceratops` | shared types, theming, logging, plugin contracts | no |
| `triiiceratops/selectors` | framework-neutral state projections | no |
| `triiiceratops/testing` | headless test kit (constructible `ViewerState`) | no |
| `triiiceratops/svelte` | Svelte 5 apps — the `<TriiiceratopsViewer>` component | **yes** |

`triiiceratops/svelte` is a superset of `triiiceratops`: everything the root
exports is re-exported there, so a Svelte app can import everything it needs from
that single specifier.

`ViewerState` is exported from the root as a **type**; the constructible class
lives in `triiiceratops/svelte`, and `triiiceratops/testing` provides one that
needs no Svelte.

!!! tip "Plugins are framework-agnostic"

    Author plugins once with the framework-neutral
    [plugin SDK](plugin-authoring.md) and use them from React, Vue, Svelte, Lit, or
    vanilla JS. See [using plugins](plugins.md#adding-a-plugin-to-your-viewer).

## Once it renders

The guides below are framework-neutral: every example carries a tab per stack,
and the tab you picked above follows you across the site.

- **[Configuration & state](configuration.md)** — panels (search, annotations,
  table of contents, collections), layout, the thumbnail gallery, and reading or
  commanding viewer state.
- **[Theming](theming.md)** — four built-in themes, typed `themeConfig` token
  overrides, or raw `--tri-*` CSS variables.
- **[Plugins](plugins.md)** — add the first-party plugins, or
  [author](plugin-authoring.md) and [test](plugin-testing.md) your own against
  the framework-neutral SDK.
- **[Content Security Policy](csp.md)** — ready-made strict-CSP recipes.

## Features

- **IIIF Presentation API**: Compatible with versions 2.0 and 3.0
- **Canvas Navigation**: Browse canvases via thumbnail gallery (dockable to any side, expandable to a full-column grid) or prev/next controls
- **Viewing Modes**: Single-page ("individuals"), book view ("paged") with offset, and continuous scroll ("continuous")
- **Behaviors**: Detects and applies IIIF `behavior` and `viewingDirection` (including RTL and top-to-bottom)
- **Structures / Table of Contents**: Parses IIIF `structures` (Ranges) for hierarchical navigation
- **Collections**: Browse IIIF Collections and navigate between manifests; items with `navDate` are sorted chronologically
- **Annotations**: Renders rectangle, polygon, and point geometries from embedded or external annotation lists
- **IIIF Choice**: Switch between alternate image views (e.g. color vs. infrared)
- **Multi-image Canvases**: Composites canvases painted with multiple images
- **IIIF Search**: Full Content Search API support with hit highlighting
- **Content State API**: Opens at a specific manifest, canvas, and region via the `iiif-content` URL parameter
- **Direct Manifest Injection**: Pass manifest JSON directly instead of loading over HTTP
- **Custom Search Providers**: React, Vue, Svelte, and custom-element hosts can all feed search results from local state or app services
- **Metadata Display**: Manifest metadata, rights, `homepage`, `rendering`, `seeAlso`, and `provider`
- **Multi-language**: Language-aware metadata with fallback chain; English and German UI translations
- **Image Services**: IIIF Image API v1/v2/v3 tiled deep-zoom
- **Theming**: Four built-in themes plus typed `themeConfig` and raw CSS-variable overrides
- **Plugin System**: Framework-agnostic plugins via an independently versioned SDK

## Development

```bash
pnpm install

pnpm dev           # Start local demo server
pnpm build:all     # Build library, web component, and demo
pnpm test          # Run unit tests
pnpm test:e2e      # Run end-to-end tests
```

## License

MIT
