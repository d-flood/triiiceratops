import { createPanelPlugin, type PluginDef } from '../../types/plugin';
import DownloadSimple from './DownloadSimpleIcon.svelte';
import ImageDownloadPanel from './ImageDownloadPanel.svelte';

export const ImageDownloadPlugin: PluginDef = createPanelPlugin({
    id: 'image-download',
    name: 'image_download_title',
    icon: DownloadSimple,
    panel: ImageDownloadPanel,
    position: 'left',
});

export { ImageDownloadPanel, DownloadSimple };
export type { ImageDownloadFormat, ImageDownloadMode } from './exportImage';
export {
    buildImageDownloadFilename,
    exportCompositeCanvas,
    exportCurrentWorld,
    exportSingleImage,
    getCanvasImageChoices,
    resolveCompositeCanvasSizeOptions,
    resolveSingleImageSizeOptions,
    resolveWorldSizeOptions,
} from './exportImage';
