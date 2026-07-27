---
icon: lucide/rocket
---

# Triiiceratops IIIF Viewer

A modern, lightweight, **framework-agnostic** IIIF viewer. Drop it into React,
Vue, plain HTML, or any other frontend as a standards-based web component — or
use it as a native Svelte component if that's your stack.

[**View Live Demo**](./viewer/){ .md-button .md-button--primary }

!!! info "This documentation describes the Triiiceratops 1.0 release line"

    Core is published as `triiiceratops`; the plugin SDK and first-party plugins
    are published under the `@triiiceratops` npm scope and versioned
    independently.

## Quick start

Drop in the web component from a CDN — no build step, no styles to import:

```html
<script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>

<triiiceratops-viewer
    manifest-id="https://iiif.wellcomecollection.org/presentation/v2/b18035723"
    style="display: block; width: 100%; height: 100vh;"
></triiiceratops-viewer>
```

That is the whole integration. Styles and themes are bundled inside the element.

## Use it in a framework

The viewer behaves the same everywhere. Install the package, then register the
web component (any framework) or import the Svelte component directly if
that's your stack. The full walkthrough for each — plugins, config, events,
SSR — is in [use with any framework](integration.md).

=== "HTML"

    ```ts
    import 'triiiceratops/element/register';
    ```

    ```html
    <triiiceratops-viewer
        manifest-id="https://example.org/manifest.json"
        style="display: block; height: 600px;"
    ></triiiceratops-viewer>
    ```

=== "React"

    ```jsx
    import { useEffect, useRef } from 'react';
    import 'triiiceratops/element/register';

    function Viewer() {
        const ref = useRef(null);
        useEffect(() => {
            if (ref.current) ref.current.manifestId = 'https://example.org/manifest.json';
        }, []);
        return <triiiceratops-viewer ref={ref} style={{ display: 'block', height: '600px' }} />;
    }
    ```

=== "Vue"

    ```vue
    <script setup>
    import { onMounted, ref } from 'vue';
    import 'triiiceratops/element/register';

    const viewer = ref(null);
    onMounted(() => (viewer.value.manifestId = 'https://example.org/manifest.json'));
    </script>

    <template>
        <triiiceratops-viewer ref="viewer" style="display: block; height: 600px" />
    </template>
    ```

=== "Svelte"

    ```html
    <script lang="ts">
        import { TriiiceratopsViewer } from 'triiiceratops';
        import 'triiiceratops/style.css'; // once, anywhere in your app
    </script>

    <!-- Container must have height -->
    <div style="height: 600px;">
        <TriiiceratopsViewer manifestId="https://example.org/manifest.json" />
    </div>
    ```

!!! tip "Plugins are framework-agnostic"

    Author plugins once with the framework-neutral
    [plugin SDK](plugin-authoring.md) and use them from React, Vue, Svelte, Lit, or
    vanilla JS. See [using plugins](plugins.md#adding-a-plugin-to-your-viewer).

## Guides

| I want to…                              | Guide                                                       |
| :--------------------------------------- | :---------------------------------------------------------- |
| Mount the viewer in React, Vue, Svelte, or plain HTML | [Use with any framework](integration.md) |
| Add plugins to the viewer               | [Plugins](plugins.md)                                       |
| Write a plugin (SDK)                    | [Plugin authoring](plugin-authoring.md) · [Plugin testing](plugin-testing.md) |
| Configure panels, layout, and state      | [Configuration](configuration.md)                           |
| Theme it                                | [Theming](theming.md)                                      |
| Deploy under a strict CSP               | [Content Security Policy](csp.md)                           |

## Configuration

Triiiceratops is highly configurable: customize the UI layout, enable or disable
panels (search, annotations, table of contents, collection navigation), and control
the thumbnail gallery.

[**Read the Configuration Guide**](./configuration.md){ .md-button }

## Theming

Three layered mechanisms, easiest first:

1. **Built-in themes** — `light`, `dark`, `teal`, or `dracula`.
2. **`themeConfig`** — override individual tokens with typed, friendly keys.
3. **CSS variables** — set the underlying `--tri-*` tokens directly.

[**Read the Theming Guide**](./theming.md){ .md-button }

## Features

- **IIIF Presentation API**: Compatible with versions 2.0 and 3.0
- **Canvas Navigation**: Browse canvases via thumbnail gallery (dockable to any side) or prev/next controls
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
- **Custom Search Providers**: Svelte hosts can feed search results from local state or app services
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
