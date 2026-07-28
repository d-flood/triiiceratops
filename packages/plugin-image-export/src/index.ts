/**
 * `@triiiceratops/plugin-image-export` — ESM entry.
 *
 * Import the plugin factory and activate it explicitly on a viewer:
 *
 * ```ts
 * import { ImageDownloadPlugin } from '@triiiceratops/plugin-image-export';
 * // Svelte:  <TriiiceratopsViewer plugins={[ImageDownloadPlugin]} />
 * // WC:      viewer.plugins = [ImageDownloadPlugin];
 * ```
 *
 * The `exportImage` helpers are re-exported with their original signatures for
 * hosts that want to drive image export programmatically.
 */

export { ImageDownloadPlugin } from './plugin';

export {
    buildImageDownloadFilename,
    exportCompositeCanvas,
    exportCurrentWorld,
    exportSingleImage,
    getCanvasImageChoices,
    getVisibleCanvasesForDownload,
    resolveCompositeCanvasSizeOptions,
    resolveSingleImageSizeOptions,
    resolveWorldSizeOptions,
} from './exportImage';
export type { ImageDownloadFormat, ImageDownloadMode } from './exportImage';
