/**
 * `triiiceratops/image-export` — the shared, framework-neutral canvas
 * image-resolution and export toolkit consumed by first-party image plugins.
 */

export {
    buildIiifImageRequestUrl,
    getCanvasId,
    getCanvasLabel,
    getDeclaredCanvasDimensions,
    resolveAllCanvasImages,
    resolveCanvasImage,
    type ResolvedCanvasImage,
} from './utils/resolveCanvasImage';

export {
    buildRelativeSizeOptions,
    clampCompositeSize,
    composeImages,
    downloadBlob,
    fetchExportImageBlob,
    fetchImageBlob,
    getCompositeImagePlacement,
    getResolvedImageExportUrl,
    isCrossOriginImageFailure,
    isLevel0ImageService,
    loadImageElement,
    resolveExportSizeOptions,
    sanitizeFilenamePart,
    type ComposeImageEntry,
    type ExportSizeOption,
} from './utils/imageExport';

export {
    canvasPointToImagePoint,
    imagePointToCanvasPoint,
    transformAnnotationToCanvasSpace,
    transformAnnotationToImageSpace,
    type CanvasImageSpaceDimensions,
} from './utils/canvasImageSpace';

export {
    DEFAULT_POINT_DIAMETER,
    POINT_SIZE_TOKEN,
    observePointDiameter,
} from './utils/pointMarker';

// Omitting the `gap` option gives the viewer's own spacing, which is why no
// gap constant is exported alongside it.
export { getCanvasDisplayLayouts } from './components/canvasLayout';

export { getVisibleCanvasEntries } from './components/viewerControls';

export { parseAnnotation } from './utils/annotationAdapter';

export { getThumbnailSrc } from './utils/getThumbnailSrc';

// Also exported from `triiiceratops` itself; here so a plugin can ask it
// without importing the Svelte-bearing root entry into its IIFE.
export type { ChoiceSelection } from './utils/paintingBodies';
export {
    isUnsupportedCanvas,
    isUnsupportedCanvasFor,
} from './utils/paintingBodies';

export { getPaintingAnnotations } from './utils/iiifParsing';

export { resolveLanguageValue } from './utils/languageMap';
