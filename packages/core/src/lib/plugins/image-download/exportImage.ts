import {
    getCanvasId,
    resolveAllCanvasImages,
    type ResolvedCanvasImage,
} from '../../utils/resolveCanvasImage';
import { getVisibleCanvasEntries } from '../../components/viewerControls';
import { getCanvasDisplayLayouts, MULTI_CANVAS_GAP } from '../../components/osdLayout';
import {
    buildRelativeSizeOptions,
    clampCompositeSize,
    composeImages,
    fetchImageBlob,
    getResolvedImageExportUrl,
    resolveExportSizeOptions,
    type ComposeImageEntry,
    type ExportSizeOption,
} from '../../utils/imageExport';
import type { ViewerState } from '../../state/viewer.svelte';

export type ImageDownloadFormat = 'image/png' | 'image/jpeg';
export type ImageDownloadMode = 'composite' | 'single' | 'world';

function sanitizeFilenamePart(value: string): string {
    return value
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export function buildImageDownloadFilename(
    canvasLabel: string,
    mode: ImageDownloadMode,
    format: ImageDownloadFormat,
): string {
    const extension = format === 'image/jpeg' ? 'jpg' : 'png';
    const base = sanitizeFilenamePart(canvasLabel) || 'image';
    const suffix = mode === 'single' ? '' : `-${mode}`;
    return `${base}${suffix}.${extension}`;
}

type ExportOptions = {
    format?: ImageDownloadFormat;
    getSelectedChoice?: (canvasId: string) => string | undefined;
};

/**
 * Every painting image on `canvas` resolved for the "single image" picker
 * and to detect whether "composite canvas" mode has more than one image to
 * offer.
 */
export function getCanvasImageChoices(
    canvas: any,
    getSelectedChoice?: (canvasId: string) => string | undefined,
): ResolvedCanvasImage[] {
    return resolveAllCanvasImages(canvas, { getSelectedChoice });
}

/**
 * Resolution options for downloading a single image from a canvas.
 */
export function resolveSingleImageSizeOptions(
    resolvedImage: ResolvedCanvasImage,
): Promise<ExportSizeOption[]> {
    return resolveExportSizeOptions(resolvedImage);
}

/**
 * Resolution options for downloading an entire (possibly composite) canvas.
 * There's no single canonical request URL once there's more than one image,
 * so this always returns a relative Original/50%/25% ladder based on the
 * canvas's own declared IIIF dimensions.
 */
export function resolveCompositeCanvasSizeOptions(
    canvas: any,
    getSelectedChoice?: (canvasId: string) => string | undefined,
): ExportSizeOption[] {
    const resolvedImages = resolveAllCanvasImages(canvas, {
        getSelectedChoice,
    });
    const first = resolvedImages[0];
    if (!first?.canvasWidth || !first?.canvasHeight) return [];

    return buildRelativeSizeOptions(first.canvasWidth, first.canvasHeight);
}

export async function exportSingleImage(
    resolvedImage: ResolvedCanvasImage,
    sizeOption: ExportSizeOption,
): Promise<Blob> {
    const url =
        sizeOption.url ??
        getResolvedImageExportUrl(resolvedImage, {
            width: sizeOption.width,
            height: sizeOption.height,
        });

    if (!url) {
        throw new Error('No exportable image found for this canvas.');
    }

    return fetchImageBlob(url);
}

export async function exportCompositeCanvas(
    canvas: any,
    sizeOption: ExportSizeOption,
    options: ExportOptions = {},
): Promise<Blob> {
    const resolvedImages = resolveAllCanvasImages(canvas, {
        getSelectedChoice: options.getSelectedChoice,
    });
    if (!resolvedImages.length) {
        throw new Error('No exportable image found for this canvas.');
    }

    const { canvasWidth, canvasHeight } = resolvedImages[0];
    if (!canvasWidth || !canvasHeight) {
        throw new Error('Unable to determine canvas dimensions for export.');
    }

    const { width: pageWidth, height: pageHeight } = clampCompositeSize(
        sizeOption.width,
        sizeOption.height,
    );
    const scale = pageWidth / canvasWidth;

    const entries = await Promise.all(
        resolvedImages.map(async (resolved) =>
            buildComposeEntry(resolved, canvasWidth, canvasHeight, scale),
        ),
    );

    return composeImages(
        entries,
        pageWidth,
        pageHeight,
        options.format ?? 'image/png',
    );
}

async function buildComposeEntry(
    resolved: ResolvedCanvasImage,
    canvasWidth: number,
    canvasHeight: number,
    scale: number,
): Promise<ComposeImageEntry> {
    const width = Math.max(
        1,
        Math.round(resolved.width * canvasWidth * scale),
    );
    const aspect =
        resolved.resourceWidth && resolved.resourceHeight
            ? resolved.resourceHeight / resolved.resourceWidth
            : canvasHeight / canvasWidth;
    const height = Math.max(1, Math.round(width * aspect));

    // Level0 services can only be requested at their native/declared sizes
    // (see resolveExportSizeOptions), so a composited member image from one
    // may be fetched at a different resolution than the rest of the page and
    // scaled to fit here via drawImage rather than via a resized request.
    const url = getResolvedImageExportUrl(resolved, { width });
    if (!url) {
        throw new Error('No exportable image found for this canvas.');
    }

    const blob = await fetchImageBlob(url);

    return {
        blob,
        x: Math.round(resolved.x * canvasWidth * scale),
        y: Math.round(resolved.y * canvasHeight * scale),
        width,
        height,
    };
}

type WorldLayoutEntry = {
    resolved: ResolvedCanvasImage;
    x: number;
    y: number;
    width: number;
};

type WorldLayout = {
    entries: WorldLayoutEntry[];
    worldWidth: number;
    worldHeight: number;
};

/**
 * Every canvas currently laid out together in the viewer (e.g. both pages of
 * a spread in `paged` mode). Used both to build the "current view" composite
 * and to let "single image" mode target one of several visible canvases
 * instead of only ever the active one.
 */
export function getVisibleCanvasesForDownload(
    viewerState: ViewerState,
): any[] {
    return getVisibleCanvasEntries({
        canvases: viewerState.canvases,
        currentCanvasId: viewerState.canvasId,
        currentCanvasIndex: viewerState.currentCanvasIndex,
        viewingMode: viewerState.viewingMode,
        pagedOffset: viewerState.pagedOffset,
    }).map((entry) => entry.canvas);
}

function buildWorldLayout(
    viewerState: ViewerState,
    getSelectedChoice?: (canvasId: string) => string | undefined,
): WorldLayout | null {
    const visibleCanvases = getVisibleCanvasesForDownload(viewerState);

    if (!visibleCanvases.length) return null;

    const positioned = visibleCanvases.flatMap((canvas, canvasIndex) => {
        const canvasId = getCanvasId(canvas) ?? `canvas-${canvasIndex}`;
        return resolveAllCanvasImages(canvas, { getSelectedChoice }).map(
            (resolved) => ({
                canvasId,
                x: resolved.x,
                y: resolved.y,
                width: resolved.width,
                tileSource: {
                    width: resolved.resourceWidth || resolved.canvasWidth,
                    height: resolved.resourceHeight || resolved.canvasHeight,
                    resolved,
                },
            }),
        );
    });

    if (!positioned.length) return null;

    const { layouts, sources } = getCanvasDisplayLayouts(positioned, {
        mode: viewerState.viewingMode,
        direction: viewerState.viewingDirection,
        preserveCanvasScale: viewerState.preserveCanvasScale,
        gap: MULTI_CANVAS_GAP,
    });

    if (!layouts.length) return null;

    const minX = Math.min(...layouts.map((layout) => layout.x));
    const minY = Math.min(...layouts.map((layout) => layout.y));
    const maxX = Math.max(
        ...layouts.map((layout) => layout.x + layout.width),
    );
    const maxY = Math.max(
        ...layouts.map((layout) => layout.y + layout.height),
    );

    const entries: WorldLayoutEntry[] = sources.map((source) => ({
        resolved: (source.tileSource as { resolved: ResolvedCanvasImage })
            .resolved,
        x: source.x - minX,
        y: source.y - minY,
        width: source.width,
    }));

    return { entries, worldWidth: maxX - minX, worldHeight: maxY - minY };
}

/**
 * Resolution options for downloading everything currently laid out together
 * in the viewer (e.g. a two-page spread in `paged` viewing mode). Reuses the
 * same layout math OSD itself uses (`getCanvasDisplayLayouts`), so the
 * downloaded image matches what's on screen; there's no single native
 * reference size across canvases, so this offers a relative ladder against
 * the first image's own native width as the reference scale.
 */
export function resolveWorldSizeOptions(
    viewerState: ViewerState,
    getSelectedChoice?: (canvasId: string) => string | undefined,
): ExportSizeOption[] {
    const layout = buildWorldLayout(viewerState, getSelectedChoice);
    if (!layout) return [];

    const reference = layout.entries[0];
    const pxPerUnit =
        reference?.resolved.resourceWidth && reference.width > 0
            ? reference.resolved.resourceWidth / reference.width
            : 1600;

    const nativeWidth = Math.round(layout.worldWidth * pxPerUnit);
    const nativeHeight = Math.round(layout.worldHeight * pxPerUnit);
    if (!nativeWidth || !nativeHeight) return [];

    return buildRelativeSizeOptions(nativeWidth, nativeHeight);
}

export async function exportCurrentWorld(
    viewerState: ViewerState,
    sizeOption: ExportSizeOption,
    options: ExportOptions = {},
): Promise<Blob> {
    const layout = buildWorldLayout(viewerState, options.getSelectedChoice);
    if (!layout) {
        throw new Error('Nothing is currently displayed in the viewer.');
    }

    const { width: pageWidth, height: pageHeight } = clampCompositeSize(
        sizeOption.width,
        sizeOption.height,
    );
    const scale = pageWidth / layout.worldWidth;

    const entries = await Promise.all(
        layout.entries.map(async ({ resolved, x, y, width }) => {
            const pixelWidth = Math.max(1, Math.round(width * scale));
            const aspect =
                resolved.resourceWidth && resolved.resourceHeight
                    ? resolved.resourceHeight / resolved.resourceWidth
                    : 1;
            const pixelHeight = Math.max(1, Math.round(pixelWidth * aspect));
            const url = getResolvedImageExportUrl(resolved, {
                width: pixelWidth,
            });
            if (!url) {
                throw new Error(
                    'No exportable image found for the current view.',
                );
            }
            const blob = await fetchImageBlob(url);

            return {
                blob,
                x: Math.round(x * scale),
                y: Math.round(y * scale),
                width: pixelWidth,
                height: pixelHeight,
            } satisfies ComposeImageEntry;
        }),
    );

    return composeImages(
        entries,
        pageWidth,
        pageHeight,
        options.format ?? 'image/png',
    );
}
