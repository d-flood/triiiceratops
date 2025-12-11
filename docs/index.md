---
icon: lucide/rocket
---

# Triiiceratops IIIF Viewer

A modern, lightweight IIIF viewer built with Svelte and OpenSeadragon. It is distributed as a web component that can be dropped into any HTML page or frontend framework.

[**View Live Demo** :lucide-external-link:](./demo/index.html){ .md-button .md-button--primary }

## Features

- **Flexible Gallery**: Explore all canvases in a manfifest in a flexible thumbnail gallery that can be a floating window or docked to any of the four sides of the viewer.
- **Annotations**: Handles IIIF annotatios.
- **Theming**: Theme support with Tailwind CSS and DaisyUI.
- **Search**: IIIF Search support.

## Current Limitations

!!! warning "Work in Progress"
    This project is a work in progress and does not support all client IIIF features.

- Does not fully support multiple images per canvas.
- Does not support IIIF collection navigation.
- IIIF Annotation Creation is not supported.

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

```html
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
