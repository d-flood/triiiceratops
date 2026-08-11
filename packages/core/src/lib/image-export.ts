/**
 * `triiiceratops/image-export` — the shared, framework-neutral canvas
 * image-resolution and export toolkit consumed by first-party image plugins.
 *
 * These helpers (IIIF canvas image resolution, size-option ladders, canvas
 * compositing, blob fetching/downloading, multi-canvas layout math, OCR/
 * annotation geometry, and thumbnail fallbacks) are pure functions used by
 * core's own rendering AND by the migrated `@triiiceratops/plugin-image-export`
 * (ticket 15) and `@triiiceratops/plugin-pdf-export` (ticket 16) packages, which
 * run in the same realm as core. Because the code is genuinely shared and remains
 * with its owning package (core), it is exposed here as a single real public seam
 * rather than duplicated into each plugin (SPEC.md — "Shared code is placed at a
 * real public seam or remains with its owning package. No unpublished catch-all
 * shared package is introduced."). The closure imports no Svelte and no viewer
 * state, so a plugin bundling this seam into its self-contained IIFE pulls in no
 * `svelte/internal`. Re-exports are explicit (not `export *`) because the source
 * modules share some symbol names (`getCanvasId`, `PositionedTileSource`), which
 * a wildcard would make ambiguous.
 */

// Canvas → image URL resolution, IIIF image requests, and canvas id/label.
export {
    buildIiifImageRequestUrl,
    getCanvasId,
    getCanvasLabel,
    resolveAllCanvasImages,
    resolveCanvasImage,
    type ResolvedCanvasImage,
} from './utils/resolveCanvasImage';

// Image composition, size ladders, single-image export URL, blob fetch/download.
export {
    buildRelativeSizeOptions,
    clampCompositeSize,
    composeImages,
    downloadBlob,
    fetchExportImageBlob,
    fetchImageBlob,
    getCompositeImagePlacement,
    getResolvedImageExportUrl,
    isLevel0ImageService,
    resolveExportSizeOptions,
    type ComposeImageEntry,
    type ExportSizeOption,
} from './utils/imageExport';

// Canvas ↔ image coordinate-space scaling and annotation geometry transforms.
export {
    canvasPointToImagePoint,
    imagePointToCanvasPoint,
    transformAnnotationToCanvasSpace,
    transformAnnotationToImageSpace,
    type CanvasImageSpaceDimensions,
} from './utils/canvasImageSpace';

// Point annotation appearance shared by core's overlay and editor plugin.
export {
    DEFAULT_POINT_RADIUS,
    resolvePointRadius,
    type PointStyle,
} from './utils/pointMarker';

// Multi-canvas layout math. The one layout implementation: an export that must
// match what is on screen calls this rather than reconstructing the arrangement
// from a shared spacing constant, which is why no gap constant is exported
// alongside it (omitting the `gap` option gives the viewer's own spacing).
export { getCanvasDisplayLayouts } from './components/canvasLayout';

// Visible canvas entries for the current viewport.
export { getVisibleCanvasEntries } from './components/viewerControls';

// OCR/annotation geometry parsing (selectable PDF text layers).
export { parseAnnotation } from './utils/annotationAdapter';

// Canvas thumbnail fallback source.
export { getThumbnailSrc } from './utils/getThumbnailSrc';

// Painting-annotation enumeration over a raw IIIF Canvas — the supported way to
// see the same image-bearing annotations the viewer does, in either IIIF
// version. Also exported from `triiiceratops` itself.
export { getPaintingAnnotations } from './utils/iiifParsing';

// IIIF language-map resolution. Raw IIIF labels come in three shapes across the
// two versions (bare string, `[{"@value","@language"}]`, and a v3 language map);
// this is the one reader for all of them, so a plugin holding raw manifest or
// canvas JSON does not reimplement it.
export { resolveLanguageValue } from './utils/languageMap';
