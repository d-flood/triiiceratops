---
icon: lucide/download
description: "Download the current IIIF canvas as a raster image, handling canvases painted with more than one image correctly."
---

# Image Download

Downloads the current canvas (or the current multi-canvas view) as a raster image, correctly handling IIIF canvases painted with more than one image. It renders as a **panel** with three modes:

- **Composite canvas** — every image on the current canvas, composited together at their annotated positions.
- **Single image** — one image from the current canvas, with a picker shown when the canvas has more than one.
- **Current view** — everything currently laid out together in the viewer (e.g. a two-page spread in `paged` viewing mode), matching the on-screen layout.

Each mode offers a resolution picker. IIIF `level0` image services can only be requested at a fixed list of sizes declared in their `info.json`, so those are enumerated exactly; other services offer an Original/50%/25% ladder based on native dimensions. Output is always capped to a size browsers can reliably render to a canvas.

## Audiovisual Canvases

A canvas whose painting annotations place only non-image content — audio, video, a
3D model — has no raster to export. It is the canvas the viewer itself gives the
**unsupported presentation** to, and this plugin leaves it out silently. That is a
contract, not an accident:

- The **single image** picker lists only canvases an image can be produced from. On a
  spread of one page and one video, the video is not offered — the reader never picks
  it and never meets a resolution list with nothing in it.
- **Current view** composites exactly the image canvases in the view, at the shape
  those canvases make on their own; the video leaves no empty column behind. As
  everywhere else, the mode is offered only when more than one canvas remains to
  combine, so that same page-and-video spread offers **single image** instead.
- On such a canvas alone, every mode is empty: no images to composite and no
  resolution ladder to pick from.
- Nothing is ever substituted for the missing image. A poster thumbnail, a
  `placeholderCanvas`, or an `accompanyingCanvas` describes the media; none of them
  is the canvas, and exporting one would hand the reader a picture the manifest never
  said was the content.

A **canvas claim** makes no difference. A claim is about what is rendered on screen;
whether a raster can be produced is decided by the canvas's own painting bodies, so
the answer is the same whether or not a media plugin has taken the canvas over.

## Setup

=== "pnpm"

    ```bash
    pnpm add @triiiceratops/plugin-image-export
    ```

=== "npm"

    ```bash
    npm install @triiiceratops/plugin-image-export
    ```

=== "bun"

    ```bash
    bun add @triiiceratops/plugin-image-export
    ```

`ImageDownloadPlugin` is exported ready to use with no configuration required.
Add it like any plugin — see
[using plugins](plugins.md#adding-a-plugin-to-your-viewer).

## Examples

- [Multiple and configured plugins](plugins.md#multiple-and-configured-plugins) —
  adding this plugin alongside others.
