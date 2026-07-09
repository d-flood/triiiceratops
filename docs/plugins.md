---
icon: lucide/plug-2
---

# Plugin System

Triiiceratops features a flexible, component-based plugin system that allows you to extend the viewer's functionality. A plugin renders its UI in one of two ways: as a **panel** docked to a sidebar (left/right/bottom/overlay), or as a compact **flyout** popover that grows out of the plugin's toolbar button.

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
    ImageManipulationFlyout,
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
    target?: 'panel' | 'flyout'; // Where the UI renders (default: 'panel')
    panel?: Component; // Component rendered when target is 'panel'
    flyout?: Component; // Component rendered when target is 'flyout'
    position?: 'left' | 'right' | 'bottom' | 'overlay'; // Panel position (default: 'left'; ignored for flyouts)
    props?: Record<string, unknown>; // Optional props to pass to the component
}
```

If you plan to control plugin UI state through `config.plugins`, set an explicit, stable `id` on each plugin. Auto-generated IDs are not stable across re-registration.

Plugin panels render in the same left and right sidebar stacks as built-in panels. When multiple panels are assigned to the same side, they stack vertically. Sidebar width is configured per side with `leftPanelWidth` and `rightPanelWidth` in the viewer configuration; plugin UI config does not define a per-plugin or per-panel width.

### Panel vs. Flyout

Two helpers wrap `PluginDef` with the right `target`:

```typescript
import { createPanelPlugin, createFlyoutPlugin } from 'triiiceratops';

// A docked side/bottom/overlay panel (the default target).
const panelPlugin = createPanelPlugin({
    id: 'my-panel',
    name: 'My Panel',
    icon: MyIcon,
    panel: MyPanelComponent,
    position: 'right',
});

// A compact flyout that grows out of the toolbar button.
const flyoutPlugin = createFlyoutPlugin({
    id: 'my-flyout',
    name: 'My Tool',
    icon: MyIcon,
    flyout: MyFlyoutComponent,
});
```

A **flyout** is a compact overlay anchored to the plugin's toolbar button. It opens
on click (with click-outside / `Esc` to dismiss) and grows toward the canvas — up
from a bottom unified bar, down from a top toolbar, and sideways from a left/right
rail — so it never opens off-screen. It renders below the toolbar's tooltips (so
tooltips always stay visible) and stays mounted while closed, so background work in
the component keeps running. Use a flyout for a handful of compact controls; use a
panel when the UI needs more room. The same `config.plugins[id]` `visible`/`open`
state applies to both targets.

Flyout components receive the same viewer context as panels (via
`getContext(VIEWER_STATE_KEY)`) and a `close()` prop that closes the flyout.

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

    If you need to customize the name or other properties of a built-in plugin, you can import the individual components. Image Manipulation ships as a flyout:

    ```svelte
    <script>
      import { TriiiceratopsViewer, createFlyoutPlugin } from 'triiiceratops';
      import 'triiiceratops/style.css';
      import { ImageManipulationFlyout, SlidersIcon } from 'triiiceratops/plugins/image-manipulation';

      const plugins = [
        createFlyoutPlugin({
          id: 'image-manipulation',
          name: 'Custom Name',
          icon: SlidersIcon,
          flyout: ImageManipulationFlyout,
        })
      ];
    </script>

    <div style="height: 600px;">
      <TriiiceratopsViewer manifestId="..." {plugins} />
    </div>
    ```

---

## Available Plugins

### Image Manipulation

Provides brightness, contrast, saturation, invert, and grayscale controls for the displayed image. It renders as a compact **flyout** that grows out of its toolbar button — three bare vertical sliders (brightness/contrast/saturation) plus invert/grayscale toggles and a reset button, all visible and interactable at once, floating directly over the canvas with no container box.

### Image Download

Downloads the current canvas (or the current multi-canvas view) as a raster image, correctly handling IIIF canvases painted with more than one image. It renders as a **panel** with three modes:

- **Composite canvas** — every image on the current canvas, composited together at their annotated positions.
- **Single image** — one image from the current canvas, with a picker shown when the canvas has more than one.
- **Current view** — everything currently laid out together in the viewer (e.g. a two-page spread in `paged` viewing mode), matching the on-screen layout.

Each mode offers a resolution picker. IIIF `level0` image services can only be requested at a fixed list of sizes declared in their `info.json`, so those are enumerated exactly; other services offer an Original/50%/25% ladder based on native dimensions. Output is always capped to a size browsers can reliably render to a canvas.

`ImageDownloadPlugin` is exported ready to use with no configuration required:

=== "Web Component"

    ```html
    <script src="triiiceratops-element.iife.js"></script>
    <script src="triiiceratops-plugin-image-download.iife.js"></script>
    <script>
        const viewer = document.querySelector('triiiceratops-viewer');
        viewer.plugins = [window.TriiiceratopsPlugins.ImageDownload];
    </script>
    ```

=== "Svelte Component"

    ```svelte
    <script>
        import { TriiiceratopsViewer } from 'triiiceratops';
        import { ImageDownloadPlugin } from 'triiiceratops/plugins/image-download';
    </script>

    <TriiiceratopsViewer plugins={[ImageDownloadPlugin]} />
    ```

### PDF Export

Exports a flat range of canvases as a browser-generated PDF, with one PDF page per selected canvas.

Feature summary:

- range-based export from the plugin panel
- one PDF page per selected canvas
- optional static or dynamic consumer-provided download filename
- optional cover sheet with consumer-provided label/value metadata
- selectable OCR text when the canvas exposes IIIF OCR annotations
- configurable browser image request settings for public or authenticated image services
- optional consumer callback for the currently selected start and end canvases

By default, `PdfExportPlugin` uses:

- an automatically generated filename based on the manifest and selected canvas range
- no cover sheet
- public-friendly image fetching with `credentials: "same-origin"`
- OCR text embedding only when suitable IIIF OCR annotations are present

#### Basic Usage

=== "Web Component"

    Script-tag usage exposes the default preconfigured plugin and a factory for configured instances:

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

Use `createPdfExportPlugin(...)` when you want a custom filename, a cover sheet, a specific OCR annotation source, export-only OCR overlays, or custom image request behavior.

```ts
import { createPdfExportPlugin } from 'triiiceratops/plugins/pdf-export';

const pdfExportPlugin = createPdfExportPlugin({
    getFilename: ({ manifestLabel, startIndex, endIndex, defaultFilename }) =>
        manifestLabel
            ? `${manifestLabel}-${startIndex + 1}-${endIndex + 1}.pdf`
            : defaultFilename,
    coverSheet: {
        title: 'Digitization Summary',
        fields: [
            { label: 'Repository', value: 'Example Library' },
            { label: 'Call Number', value: 'MS 123' },
        ],
    },
    ocrAnnotationSource: 'https://example.org/canvas/1/ocr',
    async getCanvasOcrOverlays({ canvasId }) {
        const response = await fetch(
            `/api/ocr-overlays?canvas=${encodeURIComponent(canvasId)}`,
        );
        if (!response.ok) {
            return [];
        }

        const overlays = await response.json();

        return overlays.map((overlay) => ({
            ...overlay,
            // Use 'image' when your OCR API returns coordinates in the
            // selected source image's pixel space instead of canvas pixels.
            coordinateSpace: 'image',
        }));
    },
    imageRequest: {
        credentials: 'same-origin',
    },
    onSelectionChange({ startCanvas, endCanvas, startIndex, endIndex }) {
        console.log('Selected PDF export range', {
            startCanvas,
            endCanvas,
            startIndex,
            endIndex,
        });
    },
});
```

For script-tag/web component hosts, use the factory exposed on the IIFE plugin global when you need configuration callbacks:

```html
<script>
    viewer.plugins = [
        window.TriiiceratopsPlugins.PdfExport.createPdfExportPlugin({
            onSelectionChange({
                startCanvas,
                endCanvas,
                startIndex,
                endIndex,
            }) {
                console.log('Selected PDF export range', {
                    startCanvas,
                    endCanvas,
                    startIndex,
                    endIndex,
                });
            },
        }),
    ];
</script>
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
    filename?: string;
    getFilename?: (context: {
        manifestId: string | null;
        manifestLabel?: string | null;
        startIndex: number;
        endIndex: number;
        indices: number[];
        canvases: any[];
        exportedCount: number;
        failedCanvases: string[];
        defaultFilename: string;
    }) => Promise<string | null | undefined> | string | null | undefined;
    coverSheet?: {
        title?: string;
        fields: { label: string; value: string }[];
    };
    ocrAnnotationSource?: string;
    ocrPlacementMode?: 'fit-box' | 'word-anchor';
    ocrSizingMode?: 'fit-box' | 'height-only';
    ocrVisibilityMode?: 'transparent' | 'invisible' | 'debug';
    onSelectionChange?: (selection: {
        startIndex: number | null;
        endIndex: number | null;
        startCanvas: any | null;
        endCanvas: any | null;
    }) => void;
    getCanvasOcrOverlays?: (context: {
        manifestId: string | null;
        canvasId: string;
        canvas: any;
        canvasIndex: number;
    }) =>
        | Promise<
              | {
                    text: string;
                    x: number;
                    y: number;
                    width: number;
                    height: number;
                    coordinateSpace?: 'canvas' | 'image';
                }[]
              | null
              | undefined
          >
        | {
              text: string;
              x: number;
              y: number;
              width: number;
              height: number;
              coordinateSpace?: 'canvas' | 'image';
          }[]
        | null
        | undefined;
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

#### Filename

Set `filename` when the consuming application should control the downloaded PDF name with a static value. The value is passed directly to the browser download link, so include the `.pdf` extension when you want it shown in the saved file name.

Set `getFilename` when the consuming application should compute the downloaded PDF name for each export. The callback receives the manifest identifier and label, normalized selected range, selected canvases, export counts, failed canvas labels, and the generated `defaultFilename`.

If both `filename` and `getFilename` are configured, `filename` takes precedence and `getFilename` is not called. If `getFilename` returns `null`, `undefined`, or an empty string, the plugin uses the generated filename fallback.

When both `filename` and `getFilename` are omitted, the plugin generates a PDF filename from the manifest label or identifier and the selected canvas range.

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

Manifest OCR annotations are normalized automatically when their `xywh` boxes are in the selected source image's pixel space instead of the canvas pixel space.

If your app stores OCR outside the IIIF manifest, configure `getCanvasOcrOverlays` to supply PDF text overlays directly during export. This callback runs only for canvases included in the selected PDF export range. It is not used during normal canvas navigation, search, thumbnail rendering, or viewer startup.

Provider overlay coordinates default to canvas space for backward compatibility. If your provider returns original image pixel coordinates, set `coordinateSpace: 'image'` on each overlay so the exporter can normalize them before PDF placement.

Supported OCR annotation patterns include:

- IIIF Presentation 3 annotations using `TextualBody` plus `motivation: "supplementing"`
- legacy IIIF Presentation 2 text annotation lists in `otherContent`, including `cnt:ContentAsText` bodies that use `sc:painting` for line text

OCR is resolved in this order during export:

- if `getCanvasOcrOverlays` returns a non-null value, that result is used and manifest OCR is skipped for that canvas
- otherwise, if `ocrAnnotationSource` is set, the plugin loads OCR from that specific annotation page/list `id`
- otherwise, the plugin reads OCR-compatible annotations from every available canvas annotation source

Callback result semantics:

- return `[]` to mark the canvas as handled and export it without OCR text
- return `null` or `undefined` to fall back to manifest-based OCR loading
- if the callback throws, the export logs a PDF-scoped warning and falls back to manifest-based OCR loading

OCR rendering options:

- `ocrPlacementMode: 'fit-box'` preserves the existing box-fitting behavior
- `ocrPlacementMode: 'word-anchor'` keeps each word anchored to its supplied `x` and top-origin `y` position without vertical recentering
- `ocrSizingMode: 'fit-box'` uses both overlay width and height to size the text
- `ocrSizingMode: 'height-only'` sizes from overlay height only and does not stretch words to fill the OCR width
- `ocrVisibilityMode: 'transparent'` uses the existing near-transparent text layer behavior
- `ocrVisibilityMode: 'invisible'` prefers PDF invisible text rendering semantics when supported by the PDF layer
- `ocrVisibilityMode: 'debug'` draws OCR text visibly for placement checks

Default OCR rendering behavior remains backward-compatible:

```ts
{
    ocrPlacementMode: 'fit-box',
    ocrSizingMode: 'fit-box',
    ocrVisibilityMode: 'transparent',
}
```

Recommended settings for word-level OCR overlays:

```ts
{
    ocrPlacementMode: 'word-anchor',
    ocrSizingMode: 'height-only',
    ocrVisibilityMode: 'invisible',
}
```

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
- line-level annotations are the easiest starting point for usable PDF text selection, but word-level overlays are also supported
- if your Tesseract boxes are in raw image pixels, make sure the canvas `width` and `height` match that same pixel space, or scale the boxes during annotation generation

#### Image Request Notes

The plugin fetches canvas images with `credentials: "same-origin"` by default. This avoids common CORS failures on public IIIF servers that respond with `Access-Control-Allow-Origin: *`.

For IIIF-backed exports, the plugin automatically requests wide or spread canvases by height instead of width so landscape pages are not capped by the viewer-width-derived export size. Portrait and square canvases continue to use width-constrained requests.

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

An adapter is **pure storage** — five functions, no more. The plugin owns everything else:

- **Display sync** — it injects loaded annotations into the viewer's read-only overlay and clears the overlay on teardown. Your adapter never touches `manifestsState` or any viewer state.
- **Caching and create-vs-update** — it keeps the in-memory cache and decides whether a save is a create or an update; you never call `load()` to find out.
- **Id bookkeeping** — if your server mints its own id on create, return it and the plugin reconciles it everywhere (see below). You never rewrite ids yourself.
- **Timestamp / attribution stamping** — it fills `@context`, `type`, `creator`, `created`, `modified`, and `motivation` before every create. Don't add them in the adapter.
- **Error handling** — throw (or reject) on failure and the plugin's error surface rolls back its optimistic state and notifies the host via the `onPersistenceError` config hook. Don't swallow errors.

`LocalStorageAdapter` is the reference minimal implementation.

##### The contract

```ts
interface AnnotationStorageAdapter {
    readonly id: string;
    readonly name: string;

    /** Return every annotation stored for this manifest+canvas ([] when none). */
    load(manifestId: string, canvasId: string): Promise<W3CAnnotation[]>;

    /**
     * Persist a new annotation. Return the canonical annotation (or just its id
     * string) if your server assigns the id — the plugin reconciles it. Return
     * nothing to keep the id the plugin sent.
     */
    create(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<W3CAnnotation | string | void>;

    /** Persist an update. Return the (possibly normalized) annotation to adopt it. */
    update(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<W3CAnnotation | void>;

    /** Remove an annotation by id. */
    delete(manifestId: string, canvasId: string, annotationId: string): Promise<void>;

    /** Optional: fetch one annotation's full body on demand (see below). */
    hydrate?(
        manifestId: string,
        canvasId: string,
        annotationId: string,
    ): Promise<W3CAnnotation | null>;

    /** Optional: release resources when the plugin is destroyed. */
    destroy?(): void;
}
```

`hydrate(...)` is optional. Implement it when `load()` returns lightweight headers (mark each `__fullBodyLoaded: false`) and you want to fetch large bodies only when an annotation is selected. The plugin reads that marker once, then strips it; return the full annotation from `hydrate`.

##### A complete server adapter (fetch + W3C Annotation Protocol)

This adapter talks to a [W3C Annotation Protocol](https://www.w3.org/TR/annotation-protocol/) server: one annotation container per manifest+canvas, `POST` to create (reading the minted id from the `Location` header or the returned body), `PUT` to update, `DELETE` to remove. It has no display, caching, id, or stamping code — the plugin does all of that.

```ts
import {
    createAnnotationEditorPlugin,
    type AnnotationStorageAdapter,
    type W3CAnnotation,
} from 'triiiceratops/plugins/annotation-editor';

class AnnotationServerAdapter implements AnnotationStorageAdapter {
    readonly id = 'annotation-server';
    readonly name = 'Annotation Server';

    constructor(private baseUrl: string) {}

    /** One container per manifest+canvas. */
    private container(manifestId: string, canvasId: string): string {
        const key = encodeURIComponent(`${manifestId}::${canvasId}`);
        return `${this.baseUrl}/containers/${key}/`;
    }

    async load(manifestId: string, canvasId: string): Promise<W3CAnnotation[]> {
        const res = await fetch(this.container(manifestId, canvasId), {
            headers: { Accept: 'application/ld+json' },
        });
        // An empty container is normal — return [] rather than throwing.
        if (res.status === 404) return [];
        if (!res.ok) throw new Error(`load failed: ${res.status}`);
        const page = await res.json();
        return page.items ?? [];
    }

    async create(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<W3CAnnotation> {
        const res = await fetch(this.container(manifestId, canvasId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/ld+json' },
            body: JSON.stringify(annotation),
        });
        if (!res.ok) throw new Error(`create failed: ${res.status}`);
        // Prefer the server's returned representation; fall back to the id it
        // minted in the Location header. Returning the canonical annotation lets
        // the plugin reconcile the id everywhere it is displayed and edited.
        const location = res.headers.get('Location');
        const created = await res.json().catch(() => null);
        if (created?.id) return created;
        if (location) return { ...annotation, id: location };
        return created ?? annotation;
    }

    async update(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<W3CAnnotation> {
        const res = await fetch(annotation.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/ld+json' },
            body: JSON.stringify(annotation),
        });
        if (!res.ok) throw new Error(`update failed: ${res.status}`);
        return (await res.json().catch(() => null)) ?? annotation;
    }

    async delete(
        _manifestId: string,
        _canvasId: string,
        annotationId: string,
    ): Promise<void> {
        const res = await fetch(annotationId, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) {
            throw new Error(`delete failed: ${res.status}`);
        }
    }
}

const plugin = createAnnotationEditorPlugin({
    adapter: new AnnotationServerAdapter('https://annotations.example.org'),
});
```

Errors are thrown, not caught: a rejected `load`/`create`/`update`/`delete` reaches the plugin's error surface, which rolls back the optimistic cache/display change and calls your `onPersistenceError` handler (or shows a dismissible panel message).

##### Test your adapter

Verify any adapter against the contract above with the conformance suite. It runs under [vitest](https://vitest.dev/) and checks load/create/update/delete round-trips, verbatim body preservation (including structured bodies), manifest/canvas isolation, and — when you opt in — server-assigned ids and hydrate:

```ts
// MyAdapter.contract.test.ts
import { runAdapterContractTests } from 'triiiceratops/plugins/annotation-editor/testing';
import { MyAdapter } from './MyAdapter';

runAdapterContractTests(() => new MyAdapter(), {
    supportsIdReconciliation: true, // create returns a server-minted id
    supportsHydrate: true, // hydrate() is implemented
});
```

`runAdapterContractTests` registers its own `describe`/`it` blocks, so call it at the top level of a test file. Each test uses a unique manifest/canvas pair, so it is safe against storage-backed adapters. `vitest` is the only extra requirement, and it is pulled in only through this testing subpath — it never becomes a runtime dependency of the plugin.

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

When `canCreate`/`getCreateDisabledReason` read external host state (the example above reads `window.appSelection`), give the plugin a way to know it changed with `extension.subscribe` — otherwise the creation gate only re-evaluates on the plugin's own reactive state. `subscribe(invalidate)` receives a callback to run whenever the gate should re-check, and returns an unsubscribe:

```ts
const extension: AnnotationEditorExtension<{ selectedText: string | null }> = {
    getContext: () => ({ selectedText: window.appSelection ?? null }),
    canCreate: ({ hostContext }) => !!hostContext?.selectedText,
    subscribe: (invalidate) => {
        // Re-evaluate the gate whenever the host selection changes.
        window.addEventListener('selectionchange', invalidate);
        return () => window.removeEventListener('selectionchange', invalidate);
    },
};
```

Svelte hosts can alternatively back `getContext()` with `$state` and the gate composes correctly without `subscribe`.

#### Point Annotations

The point tool authors a true IIIF [`PointSelector`](https://www.w3.org/TR/annotation-model/#point-selector), not a tiny rectangle. Clicking the canvas creates:

```json
{
    "type": "SpecificResource",
    "source": "https://example.org/canvas/1",
    "selector": { "type": "PointSelector", "x": 1234, "y": 567 }
}
```

`x`/`y` are in **canvas coordinate space**, rounded to integer pixels (matching the IIIF cookbook's point examples), and are independent of the zoom level at click time. Points render as circular markers consistently in the read-only overlay, in create mode, and while editing.

Style markers with `pointStyle`, which is consumed by **both** the read-only overlay and the editor so a point looks identical selected or not:

```ts
const plugin = createAnnotationEditorPlugin({
    pointStyle: { radius: 6, fill: '#e5484d', stroke: '#ffffff', strokeWidth: 2 },
});
```

`radius` is in screen (CSS) pixels; the default is a red marker of radius 5 (10 px diameter).

#### Custom Body Editor

The built-in body editor handles simple `{ purpose, value }` textual bodies. Projects with structured or app-specific annotation bodies can replace it with `bodyEditor`. Selection, the delete button, and card chrome stay plugin-owned; only the body UI inside the card is yours, and bodies become **opaque** — the plugin writes whatever you hand `save()` through verbatim and never assumes a shape.

There are two variants. Use `component` for Svelte hosts and `render` for the web-component/IIFE build (React, Vue, vanilla, Django templates, …):

```ts
interface AnnotationBodyEditorApi {
    annotation: W3CAnnotation; // full (hydrated) annotation, canvas space
    bodies: unknown[]; // current bodies, untyped — you own the shape
    context: AnnotationEditorRuntimeContext;
    isHydrating: boolean;
    save: (bodies: unknown[] | unknown) => Promise<void>; // persists via the store
    cancel: () => void;
    requestDelete: () => void;
}

type AnnotationBodyEditor =
    | { component: Component<{ api: AnnotationBodyEditorApi }> } // Svelte hosts
    | { render: (container: HTMLElement, api: AnnotationBodyEditorApi) => (() => void) | void };
```

=== "Svelte component"

    ```svelte
    <!-- MyBodyEditor.svelte -->
    <script lang="ts">
      import type { AnnotationBodyEditorApi } from 'triiiceratops/plugins/annotation-editor';
      let { api }: { api: AnnotationBodyEditorApi } = $props();
      let label = $state((api.bodies[0] as any)?.label ?? '');
    </script>

    <input bind:value={label} disabled={api.isHydrating} />
    <button onclick={() => api.save({ type: 'MyBody', label })}>Save</button>
    ```

    ```ts
    import MyBodyEditor from './MyBodyEditor.svelte';
    const plugin = createAnnotationEditorPlugin({
        bodyEditor: { component: MyBodyEditor },
    });
    ```

=== "Framework-agnostic `render`"

    The `render` callback receives a DOM node and the API; mount anything you like and return a cleanup function. It is re-invoked (after cleanup) when the selected annotation changes; the API object is stable per selection.

    ```ts
    const plugin = createAnnotationEditorPlugin({
        bodyEditor: {
            render(container, api) {
                const current = (api.bodies[0] as any) ?? { label: '' };
                container.innerHTML = `
                    <form>
                        <input name="label" />
                        <button type="submit">Save</button>
                    </form>`;
                const form = container.querySelector('form')!;
                (form.elements as any).label.value = current.label ?? '';
                const submit = (e: Event) => {
                    e.preventDefault();
                    api.save({
                        type: 'MyBody',
                        label: new FormData(form).get('label'),
                    });
                };
                form.addEventListener('submit', submit);
                return () => form.removeEventListener('submit', submit);
            },
        },
    });
    ```

#### Worked Example: Point-Only Tagging Tool

Combining the pieces above gives a focused "drop a tagged point" tool — point tool only, rendered as a flyout, always in create mode, with a structured-body form. This mirrors the web-component consumer demo (`src/demo-consumer`):

```ts
const annotationPlugin = createAnnotationEditorPlugin({
    adapter: new LocalStorageAdapter(),
    target: 'flyout', // a compact button + popover instead of a docked panel
    tools: ['point'],
    defaultTool: 'point',
    ui: {
        showModeToggle: false, // no Edit/Create switch
        startInCreateMode: true, // clicking the canvas drops a point immediately
        showUndoRedo: false,
        allowMultipleBodies: false,
    },
    bodyEditor: {
        render(container, api) {
            const current = (api.bodies[0] as any) ?? { label: '', confidence: 'medium' };
            container.innerHTML = `
                <form>
                    <label>Label <input name="label" /></label>
                    <label>Confidence
                        <select name="confidence">
                            <option value="low">low</option>
                            <option value="medium">medium</option>
                            <option value="high">high</option>
                        </select>
                    </label>
                    <button type="submit">Save</button>
                </form>`;
            const form = container.querySelector('form')!;
            (form.elements as any).label.value = current.label ?? '';
            (form.elements as any).confidence.value = current.confidence ?? 'medium';
            const submit = (e: Event) => {
                e.preventDefault();
                const data = new FormData(form);
                api.save({
                    type: 'TriiiceratopsDemoBody',
                    label: data.get('label'),
                    confidence: data.get('confidence'),
                });
            };
            form.addEventListener('submit', submit);
            return () => form.removeEventListener('submit', submit);
        },
    },
});
```

The structured `{ type: 'TriiiceratopsDemoBody', label, confidence }` body round-trips through `LocalStorageAdapter` (and any conforming adapter) unmodified — the plugin never inspects or filters it.

#### Configuration Reference

All options are optional; `createAnnotationEditorPlugin()` with no arguments behaves like the default `AnnotationEditorPlugin`.

| Option                    | Type                                             | Default        | Description                                                                                     |
| ------------------------- | ------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------- |
| `adapter`                 | `AnnotationStorageAdapter`                       | `LocalStorageAdapter` | Persistence backend (the five-function contract above).                                  |
| `user`                    | `{ id; name }`                                   | —              | Attribution stamped as `creator` on new annotations.                                            |
| `tools`                   | `('rectangle' \| 'polygon' \| 'point')[]`        | all three      | Which drawing tools are available and actually constrain drawing.                               |
| `defaultTool`             | `'rectangle' \| 'polygon' \| 'point'`            | first of `tools` | Initially active tool (ignored if not within `tools`).                                        |
| `defaultMotivation`       | `string`                                         | `'commenting'` | `motivation` stamped on new annotations lacking one (host/`beforeSave` values win).             |
| `drawingStyle`            | `DrawingStyle`                                   | red            | Annotorious stroke/fill for rectangles and polygons while editing.                              |
| `pointStyle`              | `{ radius?; fill?; stroke?; strokeWidth? }`      | red, radius 5  | Marker styling for points, shared by overlay and editor (`radius` in screen px).                |
| `target`                  | `'panel' \| 'flyout'`                            | `'panel'`      | Render the editor as a docked panel or a toolbar flyout.                                         |
| `position`                | `'left' \| 'right' \| 'bottom' \| 'overlay'`     | `'left'`       | Panel position when `target: 'panel'`.                                                           |
| `ui`                      | `AnnotationEditorUiConfig`                       | see below      | UI chrome and built-in body editor knobs.                                                        |
| `bodyEditor`              | `{ component } \| { render }`                    | built-in       | Replace the built-in body UI (see Custom Body Editor).                                           |
| `extension`               | `AnnotationEditorExtension`                      | —              | Host hooks: `getContext`, `subscribe`, `canCreate`, `getCreateDisabledReason`, `prepareDraft`, `beforeSave`, `onSelectionChange`. |
| `onPersistenceError`      | `(error) => void`                                | console + panel line | Called on adapter failure after the plugin rolls back; `error.retry()` re-runs it.       |
| `prepareAnnotation`       | `(annotation) => annotation`                     | —              | Backward-compatible single-hook draft prefill (prefer `extension.prepareDraft`).                |
| `canCreateAnnotation`     | `() => boolean`                                  | —              | Backward-compatible creation gate (prefer `extension.canCreate`).                               |
| `getCreateDisabledReason` | `() => string \| null`                           | —              | Backward-compatible disabled reason (prefer `extension.getCreateDisabledReason`).               |

`ui` sub-options:

| `ui` field            | Type       | Default        | Description                                                            |
| --------------------- | ---------- | -------------- | --------------------------------------------------------------------- |
| `showModeToggle`      | `boolean`  | `true`         | Show the Edit/Create segmented control.                               |
| `startInCreateMode`   | `boolean`  | `false`        | Open in create mode (only when creation is currently allowed).        |
| `showUndoRedo`        | `boolean`  | `true`         | Show the persistence-aware undo/redo buttons.                         |
| `purposes`            | `string[]` | `W3C_PURPOSES` | Purpose choices offered by the built-in body editor.                  |
| `allowMultipleBodies` | `boolean`  | `true`         | Allow adding multiple body rows in the built-in body editor.          |

#### Migrating from the v1 Adapter API

If you wrote an adapter against an earlier release:

- **Remove display-sync code.** Adapters no longer touch `manifestsState` / `setUserAnnotations`. The plugin owns display sync now; an adapter that still injects is redundant (harmless, but delete it). This is the fix for custom adapters that persisted but rendered nothing.
- **`__fullBodyLoaded` is read but no longer round-trips.** Mark skeleton entries with `__fullBodyLoaded: false` on `load()` results as before; the plugin reads the marker once, then strips it. Don't rely on it surviving into the annotation you get back.
- **Undo/redo semantics changed.** Undo/redo is now persistence-aware — it replays inverse operations through your adapter so storage and display never disagree. The old in-memory stack could resurrect deleted data on reload; that no longer happens.
- **Window events are deprecated.** The internal `triiiceratops:annotation-editor:*` `CustomEvent`s are replaced by a per-viewer bus. They are still dispatched for one release as a shim and will be removed in the next major; migrate any external listeners.
- **Stored point annotations need no migration.** Points were already persisted as `PointSelector`, so existing data loads unchanged; a legacy fragment-center read path is kept for one release.

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

| Property               | Type                                                                       | Description                              |
| ---------------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| `manifestId`           | `string \| null`                                                           | Current manifest URL                     |
| `canvasId`             | `string \| null`                                                           | Current canvas ID                        |
| `currentCanvasIndex`   | `number`                                                                   | Index of current canvas (-1 if none)     |
| `canvases`             | `any[]`                                                                    | Array of canvas objects from manifest    |
| `viewingMode`          | `'individuals' \| 'paged' \| 'continuous'`                                 | Current canvas viewing mode              |
| `viewingDirection`     | `'left-to-right' \| 'right-to-left' \| 'top-to-bottom' \| 'bottom-to-top'` | Current page/canvas order                |
| `pagedOffset`          | `number`                                                                   | Grouping offset used in `paged` mode     |
| `osdViewer`            | `OpenSeadragon.Viewer \| null`                                             | OpenSeadragon instance                   |
| `showAnnotations`      | `boolean`                                                                  | Whether annotations are visible          |
| `showThumbnailGallery` | `boolean`                                                                  | Whether the thumbnail gallery is open    |
| `showSearchPanel`      | `boolean`                                                                  | Whether the search panel is open         |
| `searchQuery`          | `string`                                                                   | Current search query                     |
| `searchResults`        | `any[]`                                                                    | Array of search results                  |
| `isSearching`          | `boolean`                                                                  | Whether a search is in progress          |
| `isFullScreen`         | `boolean`                                                                  | Whether the viewer is in fullscreen mode |
| `dockSide`             | `string`                                                                   | Current dock side for gallery            |
| `hasNext`              | `boolean`                                                                  | Whether there is a next canvas           |
| `hasPrevious`          | `boolean`                                                                  | Whether there is a previous canvas       |

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
| `triiiceratops/plugins/image-download`          | Image download plugin (ES module)       |
| `triiiceratops/plugins/image-download.iife`     | Image download plugin (IIFE bundle)     |
| `triiiceratops/plugins/image-manipulation`      | Image manipulation plugin (ES module)   |
| `triiiceratops/plugins/image-manipulation.iife` | Image manipulation plugin (IIFE bundle) |
| `triiiceratops/plugins/pdf-export`              | PDF export plugin (ES module)           |
| `triiiceratops/plugins/pdf-export.iife`         | PDF export plugin (IIFE bundle)         |
| `triiiceratops/style.css`                       | Stylesheet (for Svelte component usage) |
