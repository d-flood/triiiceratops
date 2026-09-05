---
icon: lucide/file-down
description: "Export a flat range of IIIF canvases as a browser-generated PDF, one PDF page per selected canvas."
---

# PDF Export

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

## Setup

=== "pnpm"

    ```bash
    pnpm add @triiiceratops/plugin-pdf-export
    ```

=== "npm"

    ```bash
    npm install @triiiceratops/plugin-pdf-export
    ```

=== "bun"

    ```bash
    bun add @triiiceratops/plugin-pdf-export
    ```

## Basic Usage

`PdfExportPlugin` is the default, preconfigured export; add it like any plugin
(see [using plugins](plugins.md#adding-a-plugin-to-your-viewer)). For a configured
instance, call `createPdfExportPlugin(...)` and pass the result instead — in the
browser registry, the factory is exposed on the plugin the registry returns.

## Configuring The Plugin

Use `createPdfExportPlugin(...)` when you want a custom filename, a cover sheet, a specific OCR annotation source, export-only OCR overlays, or custom image request behavior.

```ts
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

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

        return overlays.map((overlay: Record<string, unknown>) => ({
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
        window.Triiiceratops.plugins.get('@triiiceratops/plugin-pdf-export').createPdfExportPlugin({
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
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

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
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

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

## Audiovisual Canvases

A canvas whose painting annotations place only non-image content — audio, video, a
3D model — has no page in the PDF. It is the canvas the viewer itself gives the
**unsupported presentation** to, and a range covering N image canvases and M such
canvases exports N pages, with M silently omitted. That is a contract, not an
accident:

- Omitted canvases are **not** failures. They do not appear in `failedCanvases`, and
  the export reports no partial-success warning over them: there was never an image to
  fetch.
- `exportedCount`, the progress messages, and the `indices` / `canvases` handed to
  `getFilename` all describe the pages actually produced, so a host naming the file
  after its contents cannot name a canvas the file does not contain. The `startIndex`
  and `endIndex` in that same context still report the range the reader asked for.
- The panel's selected-canvas count follows the same rule: it is the number of pages
  the export will produce, so it never promises a page the file does not contain.
- Nothing is substituted for the missing image. A poster thumbnail, a
  `placeholderCanvas`, or an `accompanyingCanvas` describes the media; none of them is
  the canvas, and exporting one would hand the reader a page the manifest never said
  was the content.
- A range with no image canvases in it at all is refused rather than saved as an empty
  PDF, and the panel says so in as many words — "Unable to export any canvases to
  PDF", not a bare export failure.

A **canvas claim** makes no difference. A claim is about what is rendered on screen;
whether a page can be produced is decided by the canvas's own painting bodies, so the
answer is the same whether or not a media plugin has taken the canvas over.

## Filename

Set `filename` when the consuming application should control the downloaded PDF name with a static value. The value is passed directly to the browser download link, so include the `.pdf` extension when you want it shown in the saved file name.

Set `getFilename` when the consuming application should compute the downloaded PDF name for each export. The callback receives the manifest identifier and label, normalized selected range, selected canvases, export counts, failed canvas labels, and the generated `defaultFilename`.

If both `filename` and `getFilename` are configured, `filename` takes precedence and `getFilename` is not called. If `getFilename` returns `null`, `undefined`, or an empty string, the plugin uses the generated filename fallback.

When both `filename` and `getFilename` are omitted, the plugin generates a PDF filename from the manifest label or identifier and the selected canvas range.

## Cover Sheet

When `coverSheet` is configured, the exported PDF begins with a generated summary page.

The cover sheet includes:

- each consumer-provided `label` / `value` pair
- the PDF creation date and time
- the current page URL, when available in the browser

The export UI does not ask end users to edit these fields. They are supplied by the consuming application at plugin creation time.

## OCR Support

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

## Image Request Notes

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
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

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
