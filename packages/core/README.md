# Triiiceratops

A small, framework-agnostic IIIF viewer. Use it as a custom element in plain HTML
or any frontend, or as a typed component in React, Vue or Svelte.

- [Documentation](https://triiiceratops.org/docs/)
- [Feature tour](https://triiiceratops.org/features/): see what the viewer does with real manifests
- [Build your viewer](https://triiiceratops.org/configure/): configure a viewer visually and copy the code

Triiiceratops is heavily inspired by Mirador 4, which I still consider the premier IIIF viewer.

## Quick start

One script tag, no build step:

```html
<script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>

<triiiceratops-viewer
    manifest-id="https://iiif.wellcomecollection.org/presentation/v2/b18035723"
    style="display: block; width: 100%; height: 100vh;"
></triiiceratops-viewer>
```

Styles and themes ship inside the element. Give it a height; the viewer fills
its box.

### React, Vue and Svelte

```bash
pnpm add triiiceratops
```

```tsx
import { TriiiceratopsViewer } from 'triiiceratops/react';

<TriiiceratopsViewer
    manifestId="https://example.org/manifest.json"
    style={{ display: 'block', height: '600px' }}
/>;
```

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

```svelte
<script lang="ts">
    import { TriiiceratopsViewer } from 'triiiceratops/svelte';
    import 'triiiceratops/style.css';
</script>

<div style="height: 600px;">
    <TriiiceratopsViewer manifestId="https://example.org/manifest.json" />
</div>
```

The React and Vue wrappers render the same custom element, so every host gets
the same viewer. See the [React](https://triiiceratops.org/docs/react/),
[Vue](https://triiiceratops.org/docs/vue/) and
[Svelte](https://triiiceratops.org/docs/svelte/) guides for state, events and
controlled inputs.

### Manifest JSON and local search

Every host can pass a manifest object instead of a URL, and supply search
results from local data instead of a IIIF Content Search service:

```js
const viewer = document.querySelector('triiiceratops-viewer');

viewer.manifestId = 'urn:example:manifest';
viewer.manifestJson = {
    id: 'urn:example:manifest',
    type: 'Manifest',
    label: { none: ['Local manifest'] },
    items: [],
};

viewer.searchProvider = async (query) => [
    {
        canvasIndex: 0,
        canvasLabel: 'Page 1',
        hits: [{ type: 'hit', before: '', match: query, after: '' }],
    },
];
```

`searchProvider` does not change the manifest. Without it, the viewer uses the
search service the manifest declares, if any.

## Features

- **Presentation API** 2, 3 and 4 manifests and collections
- **Image API** 2 and 3 services, tiled or level 0, including `ImageApiSelector` regions
- **Navigation**: thumbnail gallery (dockable to any side), previous/next, and a
  table of contents from `structures`
- **Viewing modes**: single page (`individuals`), book view (`paged`, with
  offset) and continuous scroll
- **`behavior` and `viewingDirection`**, including right-to-left and top-to-bottom
- **`start`**: opens the manifest at the canvas it names
- **Collections**: move between manifests; items with `navDate` are sorted by date
- **Multiple sequences**, including `behavior: sequence` ranges, with a sequence picker
- **Composite canvases**: several painting annotations placed per image (foldouts, maps, compositions)
- **Choice**: switch between alternate images, such as color and infrared
- **Annotations**: embedded or external lists; rectangle, polygon and point
  targets; tags shown as badges; per-annotation and global visibility
- **Content Search** with hit highlighting
- **Content State**: open at a manifest, canvas and region from the
  `content-state` input or, if the host opts in, the `iiif-content` URL parameter
- **Metadata**: labels, summary, attribution, rights, `homepage`, `rendering`,
  `seeAlso` and `provider`
- **Languages**: language-aware metadata with fallbacks; English UI built in,
  German at `triiiceratops/locales/de.json`, or supply your own
- **Theming**: four built-in themes, a typed `themeConfig`, and CSS variables
- **Renderer options** via `config.renderer`: zoom per click, animation timing
  and cache budgets
- **Strict CSP** support, with [ready-made policies](https://triiiceratops.org/docs/csp/)

## Plugins

Optional features ship as separate packages, so the core stays small.

| Package                                    | What it adds                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@triiiceratops/plugin-av`                 | Audio and video canvases: playback controls, waveforms, WebVTT captions and a transcript panel                                                        |
| `@triiiceratops/plugin-annotation-editor`  | Drawing and editing annotations (rectangle, ellipse, polygon, point, whole canvas), all keyboard-operable, saved through a storage adapter you supply |
| `@triiiceratops/plugin-pdf-export`         | PDF download of a range of canvases, with optional cover sheet and selectable OCR text                                                                |
| `@triiiceratops/plugin-image-export`       | Image download of a canvas, a single image or the current view, at a chosen resolution                                                                |
| `@triiiceratops/plugin-image-manipulation` | Brightness, contrast, saturation, grayscale and invert controls                                                                                       |

Without `plugin-av`, core shows a time-based canvas as an unsupported notice
instead of dropping it. See the [plugins guide](https://triiiceratops.org/docs/plugins/),
or [write your own](https://triiiceratops.org/docs/plugin-authoring/).

## Limitations

- **Nested collections**: only the first level is browsable; deeper
  sub-collections are listed but can't be opened.
- **Date browsing within a manifest** (for example, a newspaper date picker) isn't implemented.
- **Annotation editing** works on image canvases only, and writes one target per
  annotation. Annotations with several targets still display.
- **`placeholderCanvas` and `accompanyingCanvas`** are used only on audio and
  video canvases, as the poster shown before playback.
- **3D** (Presentation 4 `Scene` canvases) isn't rendered.

The goal is every IIIF feature a client must support, with optional features as
plugins, at a fraction of the size of other full-featured viewers.

## Development

The published site (landing pages, documentation and the standalone viewer) is
one SvelteKit app in this workspace.

```bash
pnpm install

pnpm build:all     # Build the packages, the site and the example pages
pnpm dev           # Serve the site, resolving packages to source
pnpm site          # Build and serve the published site on one origin
pnpm cms           # Serve the site with an editor at each page's /edit/ route
pnpm test          # Unit tests
pnpm test:e2e      # End-to-end tests
```

## License

MIT
