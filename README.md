# Triiiceratops IIIF Viewer

A modern IIIF viewer with a small footprint (despite the name) distributed as a web component that can be dropped into any HTML page or frontend framework.

This is a work in progress and does not support all required IIIF client features (_yet_).

This project is heavily inspired by Mirador 4, which I still view as the premier IIIF viewer.

## Features

- Explore all canvases in a manfifest in a flexible thumbnail gallery that can be a floating window or docked to any of the four sides of the viewer.
- Renders IIIF annotations.
- Flexible theme support using Tailwind CSS and DaisyUI.
- IIIF Search support.

## Current Limitations (but actively working on supporting)

- Does not fully support multiple images per canvas (either multiple images in the same canvas or the `choice` property).
- Does not support IIIF collection navigation.
- Other IIIF client features are missing.

The goal is to support all IIIF client mandatory features with pluggable optional features. The footprint of Triiiceratops, despite the name, is intended to remain considerably small than other fully featured viewers while attaining feature parity.

## Usage

### Web Component

The viewer is available as a web component that works in any framework or static HTML.

**Via CDN:**

```html
<script type="module" src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.js"></script>
<link rel="stylesheet" href="https://unpkg.com/triiiceratops/dist/triiiceratops-element.css">

<div style="height: 600px; width: 100%;">
  <triiiceratops-viewer style="height: 100%; width: 100%; display: block;"
    manifest-id="https://iiif.wellcomecollection.org/presentation/v2/b18035723">
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
