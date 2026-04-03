---
icon: lucide/rocket
---

# Triiiceratops IIIF Viewer

A modern, lightweight IIIF viewer built with Svelte and OpenSeadragon. It is distributed as a web component that can be dropped into any HTML page or frontend framework.

[**View Live Demo**](./demo/){ .md-button .md-button--primary }

## Features

- **IIIF Presentation API**: Compatible with versions 2.0 and 3.0
- **Canvas Navigation**: Browse canvases via thumbnail gallery (dockable to any side) or prev/next controls
- **Viewing Modes**: Supports single-page ("individuals"), book view ("paged") with offset, and continuous scroll ("continuous")
- **Behaviors**: Automatically detects and applies IIIF `behavior` and `viewingDirection` (including RTL support)
- **Start Canvas**: Supports the IIIF `start` property to open the manifest at a specific canvas
- **Structures / Table of Contents**: Parses IIIF `structures` (Ranges) for hierarchical table of contents navigation
- **Collections**: Browse IIIF Collections and navigate between manifests within a collection
- **Annotations**:
    - Renders IIIF annotations from embedded or external annotation lists
    - Supports rectangle (xywh) and polygon (SVG selector) geometries
    - Toggle annotation visibility on/off
- **IIIF Choice**: Full support for the IIIF Choice spec—users can switch between alternate image views (e.g., color vs. infrared, different lighting conditions)
- **IIIF Search**: Full Content Search API support with hit highlighting
- **Direct Manifest Injection**: Svelte and web component integrations can pass manifest JSON directly to the viewer
- **Custom Search Providers**: Svelte integrations can feed search results from local state, SQLite, or app services
- **Metadata Display**: Shows manifest metadata, description, attribution, and license/rights
- **Multi-language**: Language-aware metadata with fallback chain; UI translations for English and German
- **Image Services**: Detects and uses IIIF Image API services (v1, v2, v3) for tiled deep-zoom
- **Theming**: 35 built-in DaisyUI themes plus custom theme configuration
- **Plugin System**: Extensible component architecture

## Current Limitations

!!! warning "Work in Progress"
This project is actively developed. The following IIIF features are not yet supported:

### Content

- **Audio/Video**: Time-based media (canvases with `duration`) not supported
- **Multiple sequences**: Only the first sequence is read

### Navigation

- **Nested collections**: Only the first level of a Collection is navigable; deeply nested sub-collections are listed but not yet browsable
- **`navDate`**: No date-based navigation for newspapers/journals

### Annotations

- **Annotation creation**: Core viewer is read-only; editing is available through optional plugins such as `annotation-editor`
- **Motivation differentiation**: All annotations rendered similarly regardless of motivation type

The `annotation-editor` plugin supports pluggable persistence and host extension hooks so applications can add workflows like lazy body hydration or selection-aware drafting without modifying the core viewer.

### Other

- **`rendering` property**: No links to alternative formats (PDF, etc.)
- **`placeholderCanvas`/`accompanyingCanvas`**: Not supported

## Usage

=== "Web Component"

    **Via CDN:**

    ```html
    <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>

    <triiiceratops-viewer
        manifest-id="https://iiif.wellcomecollection.org/presentation/v2/b18035723"
    ></triiiceratops-viewer>

    <style>
        triiiceratops-viewer {
            display: block;
            width: 100%;
            height: 100%;
        }
    </style>
    ```

    To use in-memory manifest data with the web component, assign `manifestJson` as a JavaScript property:

    ```html
    <triiiceratops-viewer id="viewer"></triiiceratops-viewer>

    <script>
      const viewer = document.getElementById('viewer');
      viewer.manifestId = 'urn:example:manifest';
      viewer.manifestJson = {
        id: 'urn:example:manifest',
        type: 'Manifest',
        label: { none: ['Local manifest'] },
        items: []
      };
    </script>
    ```

=== "Svelte Component"

    **Installation:**

    === "pnpm"

        ```bash
        pnpm add triiiceratops
        ```

    === "npm"

        ```bash
        npm install triiiceratops
        ```

    The packaged Svelte build now resolves to the package-built component modules,
    so your app compiles Triiiceratops inside its own Svelte runtime. You do not
    need to install `manifesto.js` or `openseadragon` separately for normal usage.

    **Usage:**

    ```html
    <script>
        import { TriiiceratopsViewer } from 'triiiceratops';
        // Import the default styles (unless you are using the advanced Tailwind setup)
        import 'triiiceratops/style.css';

        const manifestJson = {
            id: 'urn:example:manifest',
            type: 'Manifest',
            label: { none: ['Local manifest'] },
            items: []
        };
    </script>


    <!-- Container must have height -->
    <div style="height: 600px;">
        <TriiiceratopsViewer
            manifestId="urn:example:manifest"
            {manifestJson}
        />
    </div>
    ```

    You can also pass a `searchProvider` prop when your app wants to supply search results directly instead of relying on an HTTP IIIF Search service.

## Configuration

Triiiceratops is highly configurable, allowing you to customize the UI layout, enable/disable specialized panels (search, annotations, table of contents, collection navigation), and control the thumbnail gallery behavior.

[**Read the Configuration Guide**](./configuration.md){ .md-button }

## Theming

Triiiceratops supports full theme customization through two mechanisms:

1. **Built-in themes**: Choose from 35 pre-built DaisyUI themes
2. **Custom theme configuration**: Override individual theme properties with your own colors, border radius, etc.

[**Read the full Theming Guide**](./theming.md){ .md-button }

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
