---
icon: lucide/plug-2
---

# Plugin System

Triiiceratops features a flexible, component-based plugin system that allows you to extend the viewer's functionality by adding custom panels to the left or right sidebars.

For Svelte integrations, plugins can now be combined with direct `manifestJson` loading and a custom `searchProvider`, which makes it easier to build app-specific IIIF workflows without adding a separate HTTP layer.

## Quick Start

=== "Web Component"

    Load the viewer and plugin bundles via script tags, then assign plugins to the viewer:

    ```html
    <!DOCTYPE html>
    <html>
    <head>
      <!-- Load the viewer (self-contained, includes all dependencies) -->
      <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>

      <!-- Load plugins -->
      <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-plugin-image-manipulation.iife.js"></script>
    </head>
    <body>
      <triiiceratops-viewer manifest-id="https://example.com/manifest.json"></triiiceratops-viewer>

      <script>
        customElements.whenDefined('triiiceratops-viewer').then(() => {
          const viewer = document.querySelector('triiiceratops-viewer');
          viewer.plugins = [window.TriiiceratopsPlugins.ImageManipulation];
        });
      </script>
    </body>
    </html>
    ```

=== "Svelte Component"

    Import the viewer and plugin, then pass plugins via the `plugins` prop:

    ```svelte
    <script>
      import { TriiiceratopsViewer } from 'triiiceratops';
      import 'triiiceratops/style.css';
      import { ImageManipulationPlugin } from 'triiiceratops/plugins/image-manipulation';
    </script>

    <div style="height: 600px;">
      <TriiiceratopsViewer
        manifestId="https://example.com/manifest.json"
        plugins={[ImageManipulationPlugin]}
      />
    </div>
    ```

---

## How the Plugin System Works

### Build System Overview

Triiiceratops provides two distribution formats to support different use cases:

| Format           | Use Case                           | Plugins Loaded Via                          |
| ---------------- | ---------------------------------- | ------------------------------------------- |
| **IIFE Bundles** | Static HTML pages, no build step   | Script tags + `window.TriiiceratopsPlugins` |
| **ES Modules**   | Vite/Svelte projects with bundlers | `import` statements                         |

### IIFE Bundles (Script Tags)

The IIFE (Immediately Invoked Function Expression) bundles are self-contained JavaScript files that work in any browser without a build system.

**How it works:**

1. **`triiiceratops-element.iife.js`** (~700KB) bundles:
    - The `<triiiceratops-viewer>` custom element
    - Svelte runtime
    - OpenSeadragon image viewer
    - All core dependencies
    - Exposes a shared Svelte runtime for plugins

2. **Plugin IIFE bundles** (e.g., `triiiceratops-plugin-image-manipulation.iife.js`):
    - Bundle the plugin's Svelte components and icons
    - Use the shared Svelte runtime from the main element bundle
    - Register themselves on `window.TriiiceratopsPlugins`

!!! info "Svelte Runtime Sharing"
The viewer exposes its Svelte runtime on `window.__TriiiceratopsSvelteRuntime`, which plugins use to ensure `getContext()` and other Svelte features work correctly across bundle boundaries.

### ES Module Exports

For projects using Vite, SvelteKit, or other bundlers, Triiiceratops exports package-built ES modules that are compiled by the consuming app's Svelte pipeline. This avoids runtime clashes while still enabling tree-shaking and normal bundler integration:

```javascript
// Main Svelte component
import { TriiiceratopsViewer } from 'triiiceratops';

// Plugin components for manual assembly
import {
    ImageManipulationController,
    SlidersIcon,
} from 'triiiceratops/plugins/image-manipulation';
```

---

## Plugin Definition

A plugin is defined by a `PluginDef` object:

```typescript
import type { Component } from 'svelte';

interface PluginDef {
    id?: string; // Unique identifier (auto-generated if not provided)
    name: string; // Title shown in tooltips/headers
    icon: Component; // Icon component (e.g., from phosphor-svelte)
    panel: Component; // The Svelte component to render in the sidebar
    position?: 'left' | 'right' | 'bottom' | 'overlay'; // Panel position (default: 'left')
    props?: Record<string, unknown>; // Optional props to pass to the panel
}
```

If you plan to control plugin UI state through `config.plugins`, set an explicit, stable `id` on each plugin. Auto-generated IDs are not stable across re-registration.

## Controlling Plugin UI Through Config

Plugin toolbar button visibility and plugin panel open/closed state can be controlled through the same `config` object used for built-in panes.

Configuration shape:

```ts
type ViewerConfig = {
  plugins?: Record<
    string,
    {
      visible?: boolean; // show/hide the plugin toolbar button
      open?: boolean; // open/close the plugin panel
    }
  >;
};
```

### Live Updates In Svelte

Update `config.plugins` reactively to change plugin UI at runtime.

```svelte
<script lang="ts">
  import { TriiiceratopsViewer } from 'triiiceratops';
  import { PdfExportPlugin } from 'triiiceratops/plugins/pdf-export';

  let config = $state({
    plugins: {
      'pdf-export': {
        visible: true,
        open: false,
      },
    },
  });

  function hidePdfButtonAndOpenPanel() {
    config.plugins['pdf-export'] = {
      visible: false,
      open: true,
    };
  }
</script>

<button onclick={hidePdfButtonAndOpenPanel}>
  Hide PDF button + open PDF panel
</button>

<TriiiceratopsViewer manifestId="..." plugins={[PdfExportPlugin]} {config} />
```

### Live Updates In Web Component Hosts

When using `<triiiceratops-viewer>`, assign a new `config` object from JavaScript.

```html
<triiiceratops-viewer id="viewer"></triiiceratops-viewer>

<script>
  const viewer = document.getElementById('viewer');

  viewer.config = {
    plugins: {
      'pdf-export': {
        visible: false,
        open: true,
      },
    },
  };
</script>
```

Notes:

- `visible: false` hides only the plugin toolbar button.
- `open: true` keeps the panel open if the plugin is registered.
- `config.plugins` keys must match each plugin's `id`.

---

## Adding Plugins

=== "Web Component"

    When using the `<triiiceratops-viewer>` custom element, you cannot pass complex objects via HTML attributes. Instead, set the `plugins` property using JavaScript after the element is defined.

    **Script Tags (No Build Required):**

    ```html
    <!-- Load the viewer -->
    <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-element.iife.js"></script>

    <!-- Load plugins -->
    <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-plugin-image-manipulation.iife.js"></script>

    <triiiceratops-viewer
      manifest-id="https://iiif.wellcomecollection.org/presentation/v3/b18035723"
    ></triiiceratops-viewer>

    <script>
      customElements.whenDefined('triiiceratops-viewer').then(() => {
        const viewer = document.querySelector('triiiceratops-viewer');

        // Plugins are pre-configured objects on window.TriiiceratopsPlugins
        viewer.plugins = [
          window.TriiiceratopsPlugins.ImageManipulation
        ];
      });
    </script>
    ```

    **With a Build System:**

    If you're using the web component in a project with a bundler (Vite, Webpack, etc.):

    ```javascript
    import { ImageManipulationPlugin } from 'triiiceratops/plugins/image-manipulation';

    customElements.whenDefined('triiiceratops-viewer').then(() => {
      const viewer = document.querySelector('triiiceratops-viewer');
      viewer.plugins = [ImageManipulationPlugin];
    });
    ```

=== "Svelte Component"

    When using the `TriiiceratopsViewer` Svelte component directly, pass plugins via the `plugins` prop.

    ```svelte
    <script>
      import { TriiiceratopsViewer } from 'triiiceratops';
      import 'triiiceratops/style.css';
      import { ImageManipulationPlugin } from 'triiiceratops/plugins/image-manipulation';
    </script>

    <div style="height: 600px;">
      <TriiiceratopsViewer
        manifestId="https://example.com/manifest.json"
        plugins={[ImageManipulationPlugin]}
      />
    </div>
    ```

    **Multiple Plugins:**

    ```svelte
    <script>
      import { TriiiceratopsViewer } from 'triiiceratops';
      import 'triiiceratops/style.css';
      import { ImageManipulationPlugin } from 'triiiceratops/plugins/image-manipulation';
      import MyCustomPlugin from './MyCustomPlugin.svelte';
      import CustomIcon from './CustomIcon.svelte';

      const plugins = [
        ImageManipulationPlugin,
        {
          name: 'My Custom Feature',
          icon: CustomIcon,
          panel: MyCustomPlugin,
          position: 'right'
        }
      ];
    </script>

    <div style="height: 600px;">
      <TriiiceratopsViewer manifestId="..." {plugins} />
    </div>
    ```

    **Customizing Built-in Plugins:**

    If you need to customize the name, position, or other properties of a built-in plugin, you can import the individual components:

    ```svelte
    <script>
      import { TriiiceratopsViewer } from 'triiiceratops';
      import 'triiiceratops/style.css';
      import { ImageManipulationController, SlidersIcon } from 'triiiceratops/plugins/image-manipulation';

      const plugins = [
        {
          name: 'Custom Name',
          icon: SlidersIcon,
          panel: ImageManipulationController,
          position: 'right'  // Override default position
        }
      ];
    </script>

    <div style="height: 600px;">
      <TriiiceratopsViewer manifestId="..." {plugins} />
    </div>
    ```

---

## Available Plugins

### Image Manipulation

Provides brightness, contrast, saturation, invert, and grayscale controls for the displayed image.

### PDF Export

Exports a flat range of canvases as a browser-generated PDF, with one PDF page per selected canvas.

Feature summary:

- range-based export from the plugin panel
- one PDF page per selected canvas
- optional cover sheet with consumer-provided label/value metadata
- selectable OCR text when the canvas exposes IIIF OCR annotations
- configurable browser image request settings for public or authenticated image services

By default, `PdfExportPlugin` uses:

- no cover sheet
- public-friendly image fetching with `credentials: "same-origin"`
- OCR text embedding only when suitable IIIF OCR annotations are present

#### Basic Usage

=== "Web Component"

    Script-tag usage exposes the default preconfigured plugin only:

    ```html
    <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-plugin-pdf-export.iife.js"></script>

    <script>
      viewer.plugins = [window.TriiiceratopsPlugins.PdfExport];
    </script>
    ```

=== "Svelte Component"

    ```svelte
    <script>
      import { PdfExportPlugin } from 'triiiceratops/plugins/pdf-export';
    </script>

    <TriiiceratopsViewer manifestId="..." plugins={[PdfExportPlugin]} />
    ```

#### Configuring The Plugin

Use `createPdfExportPlugin(...)` when you want a cover sheet, a specific OCR annotation source, or custom image request behavior.

```ts
import { createPdfExportPlugin } from 'triiiceratops/plugins/pdf-export';

const pdfExportPlugin = createPdfExportPlugin({
    coverSheet: {
        title: 'Digitization Summary',
        fields: [
            { label: 'Repository', value: 'Example Library' },
            { label: 'Call Number', value: 'MS 123' },
        ],
    },
    ocrAnnotationSource: 'https://example.org/canvas/1/ocr',
    imageRequest: {
        credentials: 'same-origin',
    },
});
```

For image services that cannot be fetched directly by the browser, you can also provide a custom image loader:

```ts
import { createPdfExportPlugin } from 'triiiceratops/plugins/pdf-export';

const pdfExportPlugin = createPdfExportPlugin({
    loadImageBlob: async ({ imageUrl }) => {
        const response = await fetch(
            `/api/pdf-image?url=${encodeURIComponent(imageUrl)}`,
        );
        if (!response.ok) {
            throw new Error('Unable to load image for PDF export.');
        }

        return response.blob();
    },
});
```

You can use that configured plugin in either a Svelte app or a bundler-based host app that assigns plugins to the web component:

```ts
import { createPdfExportPlugin } from 'triiiceratops/plugins/pdf-export';

const pdfExportPlugin = createPdfExportPlugin({
    coverSheet: {
        title: 'Export Summary',
        fields: [{ label: 'Collection', value: 'Example collection' }],
    },
});

viewer.plugins = [pdfExportPlugin];
```

Configuration shape:

```ts
type PdfExportConfig = {
    coverSheet?: {
        title?: string;
        fields: { label: string; value: string }[];
    };
    ocrAnnotationSource?: string;
    imageRequest?: {
        credentials?: RequestCredentials;
        headers?: HeadersInit;
        mode?: RequestMode;
        referrerPolicy?: ReferrerPolicy;
    };
    loadImageBlob?: (params: {
        canvas: any;
        canvasId: string;
        imageUrl: string;
        manifestId: string | null;
        targetWidth: number;
        imageRequest: RequestInit;
        resolvedImage: any | null;
    }) => Promise<Blob> | Blob;
};
```

#### Cover Sheet

When `coverSheet` is configured, the exported PDF begins with a generated summary page.

The cover sheet includes:

- each consumer-provided `label` / `value` pair
- the PDF creation date and time
- the current page URL, when available in the browser

The export UI does not ask end users to edit these fields. They are supplied by the consuming application at plugin creation time.

#### OCR Support

When a canvas includes IIIF OCR annotations, the plugin embeds selectable text into the exported PDF.

The plugin reads OCR from IIIF annotation data, not from IIIF Search responses. Search hits alone are not enough because the PDF export needs stable text plus canvas-relative bounding boxes.

Supported OCR annotation patterns include:

- IIIF Presentation 3 annotations using `TextualBody` plus `motivation: "supplementing"`
- legacy IIIF Presentation 2 text annotation lists in `otherContent`, including `cnt:ContentAsText` bodies that use `sc:painting` for line text

If a canvas exposes multiple annotation pages or lists, set `ocrAnnotationSource` to the specific annotation page/list `id` you want the PDF export to use for selectable text. When omitted, the plugin reads OCR-compatible annotations from every available canvas annotation source.

To make exported PDF text selectable, provide OCR as canvas-linked IIIF annotations with these properties:

- the canvas `width` and `height` must use the same coordinate space as the OCR bounding boxes
- each OCR annotation should target a rectangle using `#xywh=x,y,w,h` or a `FragmentSelector` with `xywh=...`
- each OCR annotation should use `motivation: "supplementing"`
- each OCR annotation body should be a `TextualBody` with plain text in `value`
- embedded and external `AnnotationPage` resources are both supported
- the original ALTO, hOCR, or other OCR file can also be linked via `seeAlso`, but the plugin reads the IIIF annotations directly

Example canvas with an external OCR page:

```json
{
    "id": "https://example.org/canvas/1",
    "type": "Canvas",
    "width": 3000,
    "height": 4000,
    "annotations": [
        {
            "id": "https://example.org/canvas/1/ocr",
            "type": "AnnotationPage"
        }
    ],
    "seeAlso": [
        {
            "id": "https://example.org/canvas/1/ocr/alto.xml",
            "type": "Dataset",
            "format": "application/xml",
            "label": {
                "en": ["ALTO OCR"]
            }
        }
    ]
}
```

Example OCR annotation page:

```json
{
    "id": "https://example.org/canvas/1/ocr",
    "type": "AnnotationPage",
    "items": [
        {
            "id": "https://example.org/canvas/1/ocr/line/1",
            "type": "Annotation",
            "motivation": "supplementing",
            "body": {
                "type": "TextualBody",
                "value": "This is one OCR line.",
                "format": "text/plain"
            },
            "target": "https://example.org/canvas/1#xywh=240,380,1620,52"
        }
    ]
}
```

Tesseract guidance:

- convert each OCR line or word into one IIIF annotation item
- line-level annotations are the easiest starting point for usable PDF text selection
- if your Tesseract boxes are in raw image pixels, make sure the canvas `width` and `height` match that same pixel space, or scale the boxes during annotation generation

#### Image Request Notes

The plugin fetches canvas images with `credentials: "same-origin"` by default. This avoids common CORS failures on public IIIF servers that respond with `Access-Control-Allow-Origin: *`.

For IIIF Image API level 0 services, the plugin prefers the painting body's declared image URL instead of synthesizing an arbitrary sized IIIF image request. This is more compatible with services that expose only a fixed image URL alongside a level 0 service description.

Some IIIF image services block browser access entirely. Typical symptoms are:

- no `Access-Control-Allow-Origin` response header
- `401` or `403` responses for cross-origin image fetches
- browser errors such as `TypeError: Failed to fetch`

In those cases, a purely client-side export is not possible from a different origin. Configure `loadImageBlob` so your application can fetch the image through a same-origin proxy, a backend endpoint, or another authenticated path that the browser is allowed to read.

If your image service requires cookies or another authenticated browser session, configure the plugin explicitly:

```ts
import { createPdfExportPlugin } from 'triiiceratops/plugins/pdf-export';

const plugin = createPdfExportPlugin({
    imageRequest: {
        credentials: 'include',
        mode: 'cors',
        headers: {
            Authorization: 'Bearer <token>',
        },
    },
});
```

Supported `imageRequest` fields are passed directly to `fetch(...)`:

- `credentials`
- `headers`
- `mode`
- `referrerPolicy`

Use `loadImageBlob` when `imageRequest` is still not enough because the remote service does not allow browser access at all.

Only use `credentials: "include"` when the IIIF image service is configured for credentialed CORS.

---

### Annotation Editor

Provides optional annotation authoring on top of the read-only viewer. The plugin supports rectangle, polygon, and point drawing tools, pluggable persistence, and host-provided extension hooks for app-specific workflows.

Out of the box, `AnnotationEditorPlugin` uses a `LocalStorageAdapter`. Use `createAnnotationEditorPlugin(...)` when you want to persist elsewhere or inject host logic.

=== "Web Component"

    ```html
    <script src="https://unpkg.com/triiiceratops/dist/triiiceratops-plugin-annotation-editor.iife.js"></script>

    <script>
      viewer.plugins = [window.TriiiceratopsPlugins.AnnotationEditor];
    </script>
    ```

=== "Svelte Component"

    ```svelte
    <script>
      import { AnnotationEditorPlugin } from 'triiiceratops/plugins/annotation-editor';
    </script>

    <TriiiceratopsViewer plugins={[AnnotationEditorPlugin]} />
    ```

#### Custom Storage Adapters

The plugin persistence layer is framework-agnostic. Supply an `AnnotationStorageAdapter` to back annotations with your own API, IndexedDB, SQLite bridge, or another local/remote store.

```ts
import {
    createAnnotationEditorPlugin,
    type AnnotationStorageAdapter,
} from 'triiiceratops/plugins/annotation-editor';

const adapter: AnnotationStorageAdapter = {
    id: 'my-adapter',
    name: 'My Adapter',
    async load(manifestId, canvasId) {
        return [];
    },
    async hydrate(manifestId, canvasId, annotationId) {
        return null;
    },
    async create(manifestId, canvasId, annotation) {},
    async update(manifestId, canvasId, annotation) {},
    async delete(manifestId, canvasId, annotationId) {},
};

const plugin = createAnnotationEditorPlugin({ adapter });
```

`hydrate(...)` is optional. Implement it when you want to load lightweight annotation headers first and fetch large bodies only when a specific annotation is selected.

#### Host Extension Hooks

For app-specific behavior, prefer the `extension` API over forking the plugin. This keeps the annotation editor reusable in both the Svelte package and the web component build.

```ts
import {
    createAnnotationEditorPlugin,
    type AnnotationEditorExtension,
} from 'triiiceratops/plugins/annotation-editor';

const extension: AnnotationEditorExtension<{ selectedText: string | null }> = {
    getContext: () => ({ selectedText: window.appSelection ?? null }),
    canCreate: ({ hostContext }) => !!hostContext?.selectedText,
    getCreateDisabledReason: ({ hostContext }) =>
        hostContext?.selectedText
            ? null
            : 'Select text before creating an annotation.',
    prepareDraft: (annotation, { hostContext }) => ({
        ...annotation,
        body: hostContext?.selectedText
            ? [
                  {
                      type: 'TextualBody',
                      purpose: 'commenting',
                      value: hostContext.selectedText,
                  },
              ]
            : [],
    }),
    beforeSave: async (annotation, context) => annotation,
    onSelectionChange: (annotation, context) => {},
};

const plugin = createAnnotationEditorPlugin({ extension });
```

The extension context includes the active manifest/canvas, current editing state, selected annotation, current user, and your host-specific context object.

#### Backward-Compatible Hooks

`prepareAnnotation`, `canCreateAnnotation`, and `getCreateDisabledReason` remain available for simple integrations. New work should prefer `extension` because it works as a single, portable surface for creation rules, draft enrichment, save-time transforms, and selection callbacks.

#### Export Paths

- `triiiceratops/plugins/annotation-editor`
- `triiiceratops/plugins/annotation-editor.iife`

---

## Creating Custom Plugins

Custom plugins are Svelte components that receive props from the plugin system and can access the viewer's state via Svelte context.

### Plugin Component Props

Your plugin component receives these props:

| Prop     | Type         | Description                                |
| -------- | ------------ | ------------------------------------------ |
| `isOpen` | `boolean`    | Whether the plugin panel is currently open |
| `close`  | `() => void` | Function to close the plugin panel         |

### Accessing Viewer State

Use Svelte's `getContext` to access the viewer's reactive state:

```svelte
<script>
    import { getContext } from 'svelte';

    // Props from the plugin system
    let { isOpen, close } = $props();

    // Access the viewer's reactive state
    const viewerState = getContext('triiiceratops:viewerState');

    function handleZoomIn() {
        viewerState.osdViewer?.viewport.zoomBy(1.5);
    }

    function handleNextCanvas() {
        viewerState.nextCanvas();
    }
</script>

<div class="p-4">
    <h3>My Custom Plugin</h3>

    <p>Current canvas: {viewerState.canvasId}</p>

    <div class="flex gap-2">
        <button onclick={handleZoomIn}>Zoom In</button>
        <button onclick={handleNextCanvas}>Next Canvas</button>
        <button onclick={close}>Close</button>
    </div>
</div>
```

### ViewerState Properties

The `viewerState` context provides access to:

| Property               | Type                           | Description                              |
| ---------------------- | ------------------------------ | ---------------------------------------- |
| `manifestId`           | `string \| null`               | Current manifest URL                     |
| `canvasId`             | `string \| null`               | Current canvas ID                        |
| `currentCanvasIndex`   | `number`                       | Index of current canvas (-1 if none)     |
| `canvases`             | `any[]`                        | Array of canvas objects from manifest    |
| `osdViewer`            | `OpenSeadragon.Viewer \| null` | OpenSeadragon instance                   |
| `showAnnotations`      | `boolean`                      | Whether annotations are visible          |
| `showThumbnailGallery` | `boolean`                      | Whether the thumbnail gallery is open    |
| `showSearchPanel`      | `boolean`                      | Whether the search panel is open         |
| `searchQuery`          | `string`                       | Current search query                     |
| `searchResults`        | `any[]`                        | Array of search results                  |
| `isSearching`          | `boolean`                      | Whether a search is in progress          |
| `isFullScreen`         | `boolean`                      | Whether the viewer is in fullscreen mode |
| `dockSide`             | `string`                       | Current dock side for gallery            |
| `hasNext`              | `boolean`                      | Whether there is a next canvas           |
| `hasPrevious`          | `boolean`                      | Whether there is a previous canvas       |

And methods:

| Method                     | Description                         |
| -------------------------- | ----------------------------------- |
| `nextCanvas()`             | Navigate to the next canvas         |
| `previousCanvas()`         | Navigate to the previous canvas     |
| `setCanvas(id)`            | Navigate to a specific canvas by ID |
| `setManifest(id)`          | Load a new manifest                 |
| `toggleFullScreen()`       | Toggle fullscreen mode              |
| `toggleAnnotations()`      | Toggle annotation visibility        |
| `toggleThumbnailGallery()` | Toggle thumbnail gallery            |
| `toggleSearchPanel()`      | Toggle search panel                 |
| `search(query)`            | Perform a search (async)            |

### Registering Your Custom Plugin

=== "Web Component"

    Custom plugins for script-tag usage require building your own IIFE bundle that:

    1. Uses Svelte from `window.__TriiiceratopsSvelteRuntime`
    2. Registers on `window.TriiiceratopsPlugins`

    See `vite.config.plugins-iife.ts` in the Triiiceratops source for an example build configuration.

=== "Svelte Component"

    Simply import your custom component and add it to the plugins array:

    ```svelte
    <script>
      import { TriiiceratopsViewer } from 'triiiceratops';
      import 'triiiceratops/style.css';
      import MyCustomPanel from './MyCustomPanel.svelte';
      import MyIcon from 'phosphor-svelte/lib/Star'; // or your own icon

      const plugins = [
        {
          name: 'My Custom Plugin',
          icon: MyIcon,
          panel: MyCustomPanel,
          position: 'right'
        }
      ];
    </script>

    <div style="height: 600px;">
      <TriiiceratopsViewer manifestId="..." {plugins} />
    </div>
    ```

---

## Package Exports Reference

| Export Path                                     | Description                             |
| ----------------------------------------------- | --------------------------------------- |
| `triiiceratops`                                 | Main Svelte component and utilities     |
| `triiiceratops/element`                         | Web component IIFE bundle               |
| `triiiceratops/plugins/annotation-editor`       | Annotation editor plugin (ES module)    |
| `triiiceratops/plugins/annotation-editor.iife`  | Annotation editor plugin (IIFE bundle)  |
| `triiiceratops/plugins/image-manipulation`      | Image manipulation plugin (ES module)   |
| `triiiceratops/plugins/image-manipulation.iife` | Image manipulation plugin (IIFE bundle) |
| `triiiceratops/style.css`                       | Stylesheet (for Svelte component usage) |
