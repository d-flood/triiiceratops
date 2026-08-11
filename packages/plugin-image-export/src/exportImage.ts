import type { ViewerState } from 'triiiceratops';
import {
    buildRelativeSizeOptions,
    clampCompositeSize,
    composeImages,
    fetchExportImageBlob,
    getCanvasDisplayLayouts,
    getCanvasId,
    getCompositeImagePlacement,
    getVisibleCanvasEntries,
    resolveAllCanvasImages,
    resolveExportSizeOptions,
    type ComposeImageEntry,
    type ExportSizeOption,
    type ResolvedCanvasImage,
} from 'triiiceratops/image-export';

export type ImageDownloadFormat = 'image/png' | 'image/jpeg';
export type ImageDownloadMode = 'composite' | 'single' | 'world';

function sanitizeFilenamePart(value: string): string {
    return value
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * The default name for a downloaded image: the manifest's label and the canvas's
 * label, in that order, sanitized for a filesystem.
 *
 * Both labels are localized IIIF language maps, so the caller resolves them in
 * the viewer's **active locale** rather than passing raw JSON here — a reader
 * browsing in French should get `Evangiles-Folio-2r.jpg`, not the English label.
 * Either may resolve to nothing (a manifest with no label, an unlabeled canvas),
 * and whichever survives is used alone.
 */
export function buildImageDownloadFilename(
    canvasLabel: string,
    mode: ImageDownloadMode,
    format: ImageDownloadFormat,
    manifestLabel?: string | null,
): string {
    const extension = format === 'image/jpeg' ? 'jpg' : 'png';
    const base =
        [manifestLabel, canvasLabel]
            .map((part) => sanitizeFilenamePart(part ?? ''))
            .filter(Boolean)
            .join('-') || 'image';
    const suffix = mode === 'single' ? '' : `-${mode}`;
    return `${base}${suffix}.${extension}`;
}

type ExportOptions = {
    format?: ImageDownloadFormat;
    getSelectedChoice?: (canvasId: string) => string | undefined;
};

/**
 * How a browser reports that an image server declined to let this page read its
 * images. Matched on the message as well as the type, because a bare
 * `instanceof TypeError` would also swallow ordinary programming mistakes and
 * report them to the reader as somebody else's policy.
 */
const CROSS_ORIGIN_FETCH_MESSAGE =
    /failed to fetch|networkerror|load failed|cross-origin|cors/i;

/**
 * Whether a failed export was the image server refusing this page permission to
 * read its images, rather than anything the viewer did wrong.
 *
 * Worth telling apart because the two need opposite responses. A 404 or a
 * malformed manifest is a defect somebody can fix; this is a deliberate policy
 * decision by whoever runs the image server, and the only honest thing a viewer
 * can do is say so and stop. There is no retry, and no workaround that would not
 * be a circumvention.
 *
 * The distinction is invisible to script by design: a browser reports a blocked
 * cross-origin read as an opaque network failure precisely so a page cannot
 * learn anything from it. So this recognises the *shapes* browsers use — a
 * `TypeError` from `fetch` in each engine's wording, and the `SecurityError` a
 * canvas raises when asked to hand back pixels drawn from an image it was not
 * allowed to read.
 */
export function isCrossOriginImageFailure(error: unknown): boolean {
    if (
        typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        error.name === 'SecurityError'
    ) {
        return true;
    }

    return (
        error instanceof Error &&
        error.name === 'TypeError' &&
        CROSS_ORIGIN_FETCH_MESSAGE.test(error.message)
    );
}

/**
 * The image server a resolved image comes from, for an error message that names
 * who declined. `null` when there is no absolute URL to read a host from.
 */
export function getImageHost(resolved: ResolvedCanvasImage): string | null {
    const source = resolved.serviceId ?? resolved.resourceId;
    if (!source) return null;
    try {
        return new URL(source).host || null;
    } catch {
        return null;
    }
}

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
    // The option is passed whole: it carries `url` when the resolution is a
    // single canonical request, and only its dimensions when it is not (a
    // level0 tile tree's intermediate levels, which arrive as tiles).
    return fetchExportImageBlob(resolvedImage, sizeOption);
}

export async function exportCompositeCanvas(
    canvas: any,
    sizeOption: ExportSizeOption,
    options: ExportOptions = {},
): Promise<Blob> {
    const resolvedImages = resolveAllCanvasImages(canvas, {
        getSelectedChoice: options.getSelectedChoice,
    });
    const first = resolvedImages[0];
    if (!first) {
        throw new Error('No exportable image found for this canvas.');
    }

    const { canvasWidth, canvasHeight } = first;
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
    const placement = getCompositeImagePlacement(
        resolved,
        canvasWidth,
        canvasHeight,
        scale,
    );

    // Level0 services can only be requested at their native/declared sizes
    // (see resolveExportSizeOptions), so a composited member image from one
    // may be fetched at a different resolution than the rest of the page and
    // scaled to fit here via drawImage rather than via a resized request.
    const blob = await fetchExportImageBlob(resolved, {
        width: placement.width,
    });

    return {
        blob,
        ...placement,
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
export function getVisibleCanvasesForDownload(viewerState: ViewerState): any[] {
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
                // The box this image occupies on its manifest Canvas. Layout
                // reads only the ratio, so passing the box's own width and
                // height gives each source exactly the extent the manifest
                // declares for it. The image service's dimensions are image
                // space and are deliberately not used as canvas geometry.
                //
                // The live renderer lays out from the same manifest box, so
                // there is no divergence left between what a "current view"
                // export composes and what the reader is looking at (SPEC:
                // "manifest dimensions win permanently for geometry").
                sourceWidth: resolved.width,
                sourceHeight: resolved.height,
                tileSource: { resolved },
            }),
        );
    });

    if (!positioned.length) return null;

    const { layouts, sources } = getCanvasDisplayLayouts(positioned, {
        mode: viewerState.viewingMode,
        direction: viewerState.viewingDirection,
        preserveCanvasScale: viewerState.preserveCanvasScale,
    });

    if (!layouts.length) return null;

    const minX = Math.min(...layouts.map((layout) => layout.x));
    const minY = Math.min(...layouts.map((layout) => layout.y));
    const maxX = Math.max(...layouts.map((layout) => layout.x + layout.width));
    const maxY = Math.max(...layouts.map((layout) => layout.y + layout.height));

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
 * same layout math the viewer itself uses (`getCanvasDisplayLayouts`), so the
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
            // The image is drawn into the box the manifest declares for it,
            // which is exactly the box layout was given and sized the world
            // from. Deriving this from the image service's own dimensions
            // instead would overflow the world whenever a Canvas and its
            // image disagree, and composeImages would clip the overflow.
            const aspect =
                resolved.width > 0 && resolved.height > 0
                    ? resolved.height / resolved.width
                    : 1;
            const pixelHeight = Math.max(1, Math.round(pixelWidth * aspect));
            const blob = await fetchExportImageBlob(resolved, {
                width: pixelWidth,
            });

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
