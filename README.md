# Triiiceratops IIIF Viewer

A modern, lightweight IIIF viewer built with Svelte and OpenSeadragon. Supports IIIF Presentation API v2 and v3.

## Features

- 🖼️ Deep zoom support via OpenSeadragon
- 📚 Multi-canvas navigation
- 🔍 Content selection and search
- 🖼️ Thumbnail gallery
- 📝 Annotation display and creation (using Annotorious)
- 🌓 Light/Dark mode support (via system/theme)
- 📦 Web Component and Svelte Library distribution

## Installation & Usage

### Via CDN (Web Component)

Use the viewer as a custom element in any HTML page - no build tools required:

```html
<!-- Load the custom element -->
<script type="module" src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.js"></script>

<!-- Use it anywhere in your HTML -->
<triiiceratops-viewer 
  manifest-id="https://iiif.wellcomecollection.org/presentation/v2/b18035723"
  style="width: 100%; height: 600px;">
</triiiceratops-viewer>
```

Alternative CDN URLs:
- jsDelivr: `https://cdn.jsdelivr.net/npm/triiiceratops/dist/triiiceratops-element.js`
- unpkg: `https://unpkg.com/triiiceratops/dist/triiiceratops-element.js`

For non-module browsers, use the IIFE build:
```html
<script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>
```

### NPM - Svelte Projects

```bash
npm install triiiceratops openseadragon manifesto.js
```

```svelte
<script>
  import { TriiiceratopsViewer } from 'triiiceratops';
</script>

<div style="width: 100%; height: 600px;">
  <TriiiceratopsViewer 
    manifestId="https://iiif.wellcomecollection.org/presentation/v2/b18035723" 
  />
</div>
```

### NPM - Other Frameworks (React, Vue, etc.)

```bash
npm install triiiceratops
```

```js
// Import once to register the custom element
import 'triiiceratops/element';
```

```html
<!-- Then use in your templates -->
<triiiceratops-viewer 
  manifest-id="https://example.com/manifest.json">
</triiiceratops-viewer>
```

## Demo

To run the demo locally:

```bash
pnpm install
pnpm dev
```

To build the demo:

```bash
pnpm build:demo
```

The output will be in `docs/demo/`.

## Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build library
pnpm build:lib

# Build custom element
pnpm build:element

# Run tests
pnpm test
```

## License

MIT
