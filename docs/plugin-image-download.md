---
icon: lucide/download
---

# Image Download

Downloads the current canvas (or the current multi-canvas view) as a raster image, correctly handling IIIF canvases painted with more than one image. It renders as a **panel** with three modes:

- **Composite canvas** — every image on the current canvas, composited together at their annotated positions.
- **Single image** — one image from the current canvas, with a picker shown when the canvas has more than one.
- **Current view** — everything currently laid out together in the viewer (e.g. a two-page spread in `paged` viewing mode), matching the on-screen layout.

Each mode offers a resolution picker. IIIF `level0` image services can only be requested at a fixed list of sizes declared in their `info.json`, so those are enumerated exactly; other services offer an Original/50%/25% ladder based on native dimensions. Output is always capped to a size browsers can reliably render to a canvas.

## Setup

=== "pnpm"

    ```bash
    pnpm add @triiiceratops/plugin-image-download
    ```

=== "npm"

    ```bash
    npm install @triiiceratops/plugin-image-download
    ```

=== "bun"

    ```bash
    bun add @triiiceratops/plugin-image-download
    ```

`ImageDownloadPlugin` is exported ready to use with no configuration required.
Add it like any plugin — see
[using plugins](plugins.md#adding-a-plugin-to-your-viewer).

## Examples

- [Multiple and configured plugins](plugins.md#multiple-and-configured-plugins) —
  adding this plugin alongside others.
