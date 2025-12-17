---
icon: lucide/rocket
---

# Triiiceratops IIIF Viewer

A modern, lightweight IIIF viewer built with Svelte and OpenSeadragon. It is distributed as a web component that can be dropped into any HTML page or frontend framework.

[**View Live Demo**](./demo/){ .md-button .md-button--primary }

## Features

- Compatible with IIIF presentation API versions 2–3
- **Flexible Gallery**: Explore all canvases in a manfifest in a flexible thumbnail gallery that can be a floating window or docked to any of the four sides of the viewer.
- **Annotations**: Handles IIIF annotatios.
- **Theming**: Full theme customization with 35 built-in DaisyUI themes and custom theme configuration support.
- **Search**: IIIF Search support.
- **i18n**: Internationalization support with Paraglide. Translations are provided for English and German (so far).

## Current Limitations

!!! warning "Work in Progress"
This project is a work in progress and does not support all client IIIF features.

- Does not fully support multiple images per canvas.
- Does not support IIIF collection navigation.
- IIIF Annotation Creation is not supported.

## Usage

=== "Web Component"

    **Via CDN:**

    ```html
    <script
        type="module"
        src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.js"
    ></script>

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

    **Usage:**

    ```html
    <script>
        import { TriiiceratopsViewer } from 'triiiceratops';
        // Import the default styles (unless you are using the advanced Tailwind setup)
        import 'triiiceratops/style.css';
    </script>


    <!-- Container must have height -->
    <div style="height: 600px;">
        <TriiiceratopsViewer
            manifestId="https://iiif.wellcomecollection.org/presentation/v2/b18035723"
        />
    </div>
    ```

## Configuration

Triiiceratops is highly configurable, allowing you to customize the UI layout, enable/disable specialized panels (search, annotations), and control the thumbnail gallery behavior.

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
