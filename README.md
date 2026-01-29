# Triiiceratops IIIF Viewer

A modern IIIF viewer with a small footprint (despite the name) distributed as a web component that can be dropped into any HTML page or frontend framework.

This is a work in progress and does not support all required IIIF client features (_yet_).

This project is heavily inspired by Mirador 4, which I still view as the premier IIIF viewer.

## Features

- **IIIF Presentation API**: Compatible with versions 2.0 and 3.0
- **Canvas Navigation**: Browse canvases via thumbnail gallery (dockable to any side) or prev/next controls
- **Viewing Modes**: Supports single-page ("individuals"), book view ("paged") with offset, and continuous scroll ("continuous")
- **Behaviors**: Automatically detects and applies IIIF `behavior` and `viewingDirection` (including RTL support)
- **Annotations**:
  - Renders IIIF annotations from embedded or external annotation lists
  - Supports rectangle (xywh) and polygon (SVG selector) geometries
  - Toggle annotation visibility on/off
- **IIIF Search**: Full Content Search API support with hit highlighting
- **Metadata Display**: Shows manifest metadata, description, attribution, and license/rights
- **Multi-language**: Language-aware metadata with fallback chain; UI translations for English and German
- **Image Services**: Detects and uses IIIF Image API services (v1, v2, v3) for tiled deep-zoom
- **Theming**: 35 built-in DaisyUI themes plus custom theme configuration

## Current Limitations

This project is actively developed. The following IIIF features are not yet supported:

### Content

- **Multiple images per canvas**: Only the first image is used; the `choice` property is not supported
- **Audio/Video**: Time-based media (canvases with `duration`) not supported
- **Multiple sequences**: Only the first sequence is read

### Navigation

- **Collections**: Cannot browse IIIF Collections or navigate between manifests
- **Ranges/Structures**: No table of contents or hierarchical navigation (book chapters, sections)
- **`start` property**: Cannot specify initial canvas or temporal position
- **`navDate`**: No date-based navigation for newspapers/journals

### Annotations

- **Annotation creation**: Read-only; cannot create or edit annotations
- **Motivation differentiation**: All annotations rendered similarly regardless of motivation type

### Other

- **`rendering` property**: No links to alternative formats (PDF, etc.)
- **`placeholderCanvas`/`accompanyingCanvas`**: Not supported

The goal is to support all IIIF client mandatory features with pluggable optional features. The footprint of Triiiceratops, despite the name, is intended to remain considerably smaller than other fully featured viewers while attaining feature parity.

## Usage

### Web Component

The viewer is available as a web component that works in any framework or static HTML.

**Via CDN:**

```html
<script
    type="module"
    src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.js"
></script>
<link
    rel="stylesheet"
    href="https://unpkg.com/triiiceratops/dist/triiiceratops-element.css"
/>

<div style="height: 600px; width: 100%;">
    <triiiceratops-viewer
        style="height: 100%; width: 100%; display: block;"
        manifest-id="https://iiif.wellcomecollection.org/presentation/v2/b18035723"
    >
    </triiiceratops-viewer>
</div>
```

### Svelte Component

If you are using Svelte, you can import the component directly.

**Installation:**

```bash
pnpm add triiiceratops
```

**Usage:**

```svelte
<script>
    import { TriiiceratopsViewer } from 'triiiceratops';
</script>

<!-- Container must have height -->
<div style="height: 600px;">
    <TriiiceratopsViewer
        manifestId="https://iiif.wellcomecollection.org/presentation/v2/b18035723"
    />
</div>
```

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
