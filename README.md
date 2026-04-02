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
- **IIIF Choice**: Full support for the IIIF Choice spec—users can switch between alternate image views (e.g., color vs. infrared, different lighting conditions)
- **IIIF Search**: Full Content Search API support with hit highlighting
- **Direct Manifest Injection**: Svelte and web component consumers can pass manifest JSON directly instead of loading over HTTP
- **Custom Search Providers**: Svelte consumers can supply local or app-backed search results without exposing an HTTP IIIF Search endpoint
- **Metadata Display**: Shows manifest metadata, description, attribution, and license/rights
- **Multi-language**: Language-aware metadata with fallback chain; UI translations for English and German
- **Image Services**: Detects and uses IIIF Image API services (v1, v2, v3) for tiled deep-zoom
- **Theming**: 35 built-in DaisyUI themes plus custom theme configuration
- **OpenSeadragon Customization**: Pass custom OSD options (e.g. max zoom level, animation speed) via `openSeadragonConfig`

## Current Limitations

This project is actively developed. The following IIIF features are not yet supported:

### Content

- **Audio/Video**: Time-based media (canvases with `duration`) not supported
- **Multiple sequences**: Only the first sequence is read

### Navigation

- **Collections**: Cannot browse IIIF Collections or navigate between manifests
- **Ranges/Structures**: No table of contents or hierarchical navigation (book chapters, sections)
- **`start` property**: Cannot specify initial canvas or temporal position
- **`navDate`**: No date-based navigation for newspapers/journals

### Annotations

- **Annotation creation**: Core viewer is read-only; editing is available through optional plugins such as `annotation-editor`
- **Motivation differentiation**: All annotations rendered similarly regardless of motivation type

The `annotation-editor` plugin supports custom storage adapters plus extension hooks for host apps that need to inject create rules, draft enrichment, lazy body hydration, or selection-linked workflows without forking the plugin. See `docs/plugins.md`.

There is also an optional `pdf-export` plugin for downloading a selected flat range of canvases as a client-side PDF, with optional consumer-configured cover-sheet metadata and an optional OCR annotation-source selector for PDF text. When canvases include IIIF OCR annotations with `supplementing` text bodies and `xywh` targets, the plugin embeds that OCR as selectable PDF text. For private or non-CORS image services, consumers can supply their own image loader/proxy path. See `docs/plugins.md`.

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

To load a manifest directly from JSON, assign it as a property from JavaScript:

```html
<triiiceratops-viewer id="viewer"></triiiceratops-viewer>

<script type="module">
    const viewer = document.getElementById('viewer');
    viewer.manifestId = 'urn:example:manifest';
    viewer.manifestJson = {
        id: 'urn:example:manifest',
        type: 'Manifest',
        label: { none: ['Local manifest'] },
        items: [],
    };
</script>
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

    const manifestJson = {
        id: 'urn:example:manifest',
        type: 'Manifest',
        label: { none: ['Local manifest'] },
        items: [],
    };
</script>

<!-- Container must have height -->
<div style="height: 600px;">
    <TriiiceratopsViewer manifestId="urn:example:manifest" {manifestJson} />
</div>
```

### Local Search in Svelte

If your application stores transcript or annotation data locally, you can provide search results directly with `searchProvider`:

```svelte
<script>
    import { TriiiceratopsViewer } from 'triiiceratops';

    const searchProvider = async (query, context) => {
        return [
            {
                canvasIndex: 0,
                canvasLabel: 'Page 1',
                hits: [{ type: 'hit', before: '', match: query, after: '' }],
            },
        ];
    };
</script>

<TriiiceratopsViewer
    manifestId="urn:example:manifest"
    {manifestJson}
    {searchProvider}
/>
```

`searchProvider` is a callback hook, not a IIIF Search service declaration. It does not add, replace, or override a search service URI in the manifest. If your manifest already declares a normal IIIF Search service, Triiiceratops will use that service when `searchProvider` is not supplied.

The web component can also load manifest JSON directly via the `manifestJson` property, but custom search providers remain a Svelte-only integration hook for now.

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
