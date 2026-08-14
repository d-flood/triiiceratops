import {
    popGraphicsState,
    pushGraphicsState,
    rgb,
    setTextRenderingMode,
    StandardFonts,
    TextRenderingMode,
} from 'pdf-lib';

// Shared canvas/image-export utilities consumed from core's public,
// framework-neutral seam (the `triiiceratops/image-export` barrel) — not
// duplicated into this package. Externalized in the ESM build; bundled (Svelte-
// free) into the self-contained IIFE.
import {
    buildIiifImageRequestUrl,
    composeImages,
    downloadBlob,
    fetchExportImageBlob,
    fetchImageBlob,
    getCanvasId,
    getCanvasLabel,
    getCompositeImagePlacement,
    getDeclaredCanvasDimensions,
    getResolvedImageExportUrl,
    getThumbnailSrc,
    isCrossOriginImageFailure,
    isLevel0ImageService,
    isUnsupportedCanvas,
    loadImageElement,
    parseAnnotation,
    resolveAllCanvasImages,
    resolveCanvasImage,
    sanitizeFilenamePart,
    type ResolvedCanvasImage,
} from 'triiiceratops/image-export';

/**
 * Progress + error strings `exportCanvasRangeAsPdf` emits. In core this logic
 * imported the Svelte i18n runtime (`m.pdf_export_*`); a framework-neutral,
 * package-owned plugin must not, so the strings are injected instead. Callers
 * (the plugin panel) pass builders resolved from the SDK per-viewer locale
 * service over this package's catalog; the module ships English defaults so the
 * pure logic — and its moved unit tests — run without a locale service.
 */
export interface PdfExportMessages {
    errorNoCanvases(): string;
    errorNotAvailable(): string;
    errorNoCanvasesExported(): string;
    progressCoverSheet(): string;
    progressCanvas(params: {
        current: number;
        total: number;
        label: string;
    }): string;
    progressDownload(params: { filename: string }): string;
}

/** English fallbacks — the same strings core shipped in `messages/en.json`. */
export const DEFAULT_PDF_EXPORT_MESSAGES: PdfExportMessages = {
    errorNoCanvases: () => 'No canvases available to export.',
    errorNotAvailable: () =>
        'PDF export is not available for this item because the image source ' +
        'does not allow direct browser download access.',
    errorNoCanvasesExported: () => 'Unable to export any canvases to PDF.',
    progressCoverSheet: () => 'Preparing cover sheet...',
    progressCanvas: ({ current, total, label }) =>
        `Exporting ${current} of ${total}: ${label}`,
    progressDownload: ({ filename }) => `Preparing download: ${filename}`,
};

type NormalizeCanvasRangeResult = {
    startIndex: number;
    endIndex: number;
    indices: number[];
};

export type PdfCoverSheetField = {
    label: string;
    value: string;
};

export type PdfCoverSheetConfig = {
    title?: string;
    fields: PdfCoverSheetField[];
};

export type PdfImageRequestConfig = Pick<
    RequestInit,
    'credentials' | 'headers' | 'mode' | 'referrerPolicy'
>;

export type PdfImageLoaderParams = {
    canvas: any;
    canvasId: string;
    imageUrl: string;
    manifestId: string | null;
    targetWidth: number;
    imageRequest: RequestInit;
    resolvedImage: ResolvedCanvasImage | null;
};

export type PdfImageLoader = (
    params: PdfImageLoaderParams,
) => Promise<Blob> | Blob;

export type PdfTextOverlay = {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    coordinateSpace?: 'canvas' | 'image';
};

export type PdfExportOcrProviderContext = {
    manifestId: string | null;
    canvasId: string;
    canvas: any;
    canvasIndex: number;
};

export type PdfCanvasOcrOverlayProvider = (
    context: PdfExportOcrProviderContext,
) =>
    | Promise<PdfTextOverlay[] | null | undefined>
    | PdfTextOverlay[]
    | null
    | undefined;

export type PdfExportFilenameProviderContext = {
    manifestId: string | null;
    manifestLabel?: string | null;
    startIndex: number;
    endIndex: number;
    indices: number[];
    canvases: any[];
    exportedCount: number;
    failedCanvases: string[];
    defaultFilename: string;
};

export type PdfExportFilenameProvider = (
    context: PdfExportFilenameProviderContext,
) => Promise<string | null | undefined> | string | null | undefined;

export type PdfOcrPlacementMode = 'fit-box' | 'word-anchor';

export type PdfOcrSizingMode = 'fit-box' | 'height-only';

export type PdfOcrVisibilityMode = 'transparent' | 'invisible' | 'debug';

type PdfOcrRenderOptions = {
    placementMode: PdfOcrPlacementMode;
    sizingMode: PdfOcrSizingMode;
    visibilityMode: PdfOcrVisibilityMode;
};

type ExportCanvasRangeAsPdfParams = {
    canvases: any[];
    startIndex: number;
    endIndex: number;
    targetWidth: number;
    manifestId: string | null;
    manifestLabel?: string | null;
    getSelectedChoice?: (canvasId: string) => string | undefined;
    getCanvasOcrOverlays?: PdfCanvasOcrOverlayProvider;
    getCanvasAnnotations?: (canvasId: string) => Promise<any[]> | any[];
    imageRequest?: PdfImageRequestConfig;
    loadImageBlob?: PdfImageLoader;
    ocrPlacementMode?: PdfOcrPlacementMode;
    ocrSizingMode?: PdfOcrSizingMode;
    ocrVisibilityMode?: PdfOcrVisibilityMode;
    filename?: string;
    getFilename?: PdfExportFilenameProvider;
    coverSheet?: PdfCoverSheetConfig;
    createdAt?: Date;
    currentUrl?: string | null;
    onProgress?: (message: string) => void;
    /** Localized progress/error strings; defaults to English. */
    messages?: PdfExportMessages;
};

type ExportCanvasRangeAsPdfResult = {
    exportedCount: number;
    failedCanvases: string[];
    filename: string;
};

type CoverSheetRuntimeValues = {
    createdAt: Date;
    currentUrl: string | null;
};

type TextBody = {
    value: string;
    format?: string;
    purpose?: string;
};

type WrappedLine = {
    text: string;
    width: number;
};

type OcrWordLayout = {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    renderedHeight: number;
};

const COVER_PAGE_SIZE: [number, number] = [612, 792];
const COVER_MARGIN_X = 56;
const COVER_MARGIN_Y = 64;
const COVER_LABEL_SIZE = 11;
const COVER_VALUE_SIZE = 12;
const COVER_TITLE_SIZE = 22;
const DEFAULT_OCR_RENDER_OPTIONS: PdfOcrRenderOptions = {
    placementMode: 'fit-box',
    sizingMode: 'fit-box',
    visibilityMode: 'transparent',
};

function getManifestFilenameBase(
    manifestId: string | null,
    manifestLabel?: string | null,
): string {
    if (manifestLabel) {
        const sanitized = sanitizeFilenamePart(manifestLabel);
        if (sanitized) return sanitized;
    }

    if (!manifestId) {
        return 'iiif-canvases';
    }

    try {
        const url = new URL(manifestId);
        const lastSegment = url.pathname.split('/').filter(Boolean).pop();
        return (
            sanitizeFilenamePart(lastSegment || 'iiif-canvases') ||
            'iiif-canvases'
        );
    } catch {
        // Not a URL: fall back to sanitizing the raw manifest id.
        return sanitizeFilenamePart(manifestId) || 'iiif-canvases';
    }
}

function formatCreationDate(createdAt: Date): string {
    return createdAt.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function isPdfCoverSheetField(value: unknown): value is PdfCoverSheetField {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const field = value as Record<string, unknown>;
    return typeof field.label === 'string' && typeof field.value === 'string';
}

function normalizeCoverSheetFields(fields: unknown): PdfCoverSheetField[] {
    if (Array.isArray(fields)) {
        // Unsupported entries are dropped silently — the cover sheet is
        // best-effort and any usable entries still render.
        return fields.flatMap((field) => {
            if (isPdfCoverSheetField(field)) {
                return [{ ...field }];
            }

            if (Array.isArray(field) && field.length >= 2) {
                return [
                    {
                        label: String(field[0]),
                        value: String(field[1]),
                    },
                ];
            }

            return [];
        });
    }

    if (isPdfCoverSheetField(fields)) {
        return [{ ...fields }];
    }

    if (fields && typeof fields === 'object') {
        return Object.entries(fields).flatMap(([label, value]) => {
            if (value == null) {
                return [];
            }

            return [{ label, value: String(value) }];
        });
    }

    return [];
}

function getMotivations(annotation: any): string[] {
    // `motivation` is spelled the same on a raw IIIF v2 and v3 annotation.
    const raw = annotation?.motivation;

    if (!raw) {
        return [];
    }

    return (Array.isArray(raw) ? raw : [raw]).map((value) => String(value));
}

function getBodyCandidates(annotation: any): any[] {
    // IIIF v3 spells the body `body`, v2 spells it `resource`; both are read.
    const rawBody = annotation?.body || annotation?.resource;
    if (rawBody) {
        return Array.isArray(rawBody) ? rawBody : [rawBody];
    }

    return [];
}

function getTextBodies(annotation: any): TextBody[] {
    return getBodyCandidates(annotation)
        .map((body): TextBody | null => {
            // v3 `value`, v2 `chars`.
            const value = body?.value || body?.chars;
            if (typeof value !== 'string' || !value.trim()) {
                return null;
            }

            // `format` is spelled the same in both versions.
            const format = body?.format;
            const purpose = body?.purpose || body?.motivation;

            return {
                value: value.trim(),
                format: typeof format === 'string' ? format : undefined,
                purpose: typeof purpose === 'string' ? purpose : undefined,
            };
        })
        .filter((body): body is TextBody => body !== null);
}

function isOcrAnnotation(annotation: any, bodies: TextBody[]): boolean {
    const motivations = getMotivations(annotation);
    const hasSupplementingMotivation = motivations.some(
        (value) => value === 'supplementing' || value === 'oa:supplementing',
    );
    const hasLegacyPaintingMotivation = motivations.some(
        (value) => value === 'sc:painting' || value === 'painting',
    );
    const hasSupplementingBody = bodies.some(
        (body) =>
            body.purpose === 'supplementing' || body.purpose === 'transcribing',
    );
    const hasLegacyTextBody = bodies.some(
        (body) => body.format === 'text/plain' && !!body.value,
    );

    return (
        hasSupplementingMotivation ||
        hasSupplementingBody ||
        (hasLegacyPaintingMotivation && hasLegacyTextBody)
    );
}

function getFontSizeToFit(
    font: any,
    text: string,
    width: number,
    height: number,
    sizingMode: PdfOcrSizingMode = 'fit-box',
): number {
    if (width <= 0 || height <= 0) {
        return 0;
    }

    const unitHeight = Math.max(
        0.001,
        font.heightAtSize(1, { descender: false }),
    );
    const unitWidth = Math.max(0.001, font.widthOfTextAtSize(text, 1));
    const heightBasedSize = height / unitHeight;

    if (sizingMode === 'height-only') {
        return Math.max(1, heightBasedSize);
    }

    const widthBasedSize = width / unitWidth;

    if (text.trim().length <= 3) {
        return Math.max(1, heightBasedSize);
    }

    return Math.max(1, Math.min(heightBasedSize, widthBasedSize * 1.15));
}

function getCanvasExportResource(
    canvas: any,
    targetWidth: number,
    getSelectedChoice?: (canvasId: string) => string | undefined,
): { imageUrl: string | null; resolvedImage: ResolvedCanvasImage | null } {
    const resolved = resolveCanvasImage(canvas, { getSelectedChoice });
    const canvasDimensions = getDeclaredCanvasDimensions(canvas);
    // A level0 service answers no constructed request, so there is no sized URL
    // to build here — `loadCanvasImageBlob` retrieves these through core's export
    // seam, which reads `info.json` first. `imageUrl` remains the published
    // resource: the one URL such a manifest guarantees without a fetch, and what
    // a host-supplied `loadImageBlob` has always been handed for this case.
    //
    // `isLevel0ImageService` rather than a local string comparison, which missed the
    // version 1 `…#level0` fragment spelling and sent those canvases down the
    // constructed-request path to 404.
    if (resolved?.resourceId && isLevel0ImageService(resolved.serviceProfile)) {
        return { imageUrl: resolved.resourceId, resolvedImage: resolved };
    }

    if (resolved?.serviceId) {
        const isWideCanvas =
            !!canvasDimensions &&
            canvasDimensions.width > canvasDimensions.height;
        const constrainedSize = canvasDimensions
            ? Math.max(
                  1,
                  Math.round(
                      Math.min(
                          isWideCanvas
                              ? canvasDimensions.height
                              : canvasDimensions.width,
                          targetWidth,
                      ),
                  ),
              )
            : Math.max(1, Math.round(targetWidth));

        return {
            imageUrl: isWideCanvas
                ? buildIiifImageRequestUrl(resolved.serviceId, {
                      region: resolved.imageApiRegion
                          ? [
                                resolved.imageApiRegion.x,
                                resolved.imageApiRegion.y,
                                resolved.imageApiRegion.width,
                                resolved.imageApiRegion.height,
                            ]
                                .map((value) => Math.round(value))
                                .join(',')
                          : undefined,
                      height: constrainedSize,
                  })
                : buildIiifImageRequestUrl(resolved.serviceId, {
                      region: resolved.imageApiRegion
                          ? [
                                resolved.imageApiRegion.x,
                                resolved.imageApiRegion.y,
                                resolved.imageApiRegion.width,
                                resolved.imageApiRegion.height,
                            ]
                                .map((value) => Math.round(value))
                                .join(',')
                          : undefined,
                      width: constrainedSize,
                  }),
            resolvedImage: resolved,
        };
    }

    if (resolved?.resourceId) {
        return { imageUrl: resolved.resourceId, resolvedImage: resolved };
    }

    return {
        imageUrl: getThumbnailSrc(canvas, targetWidth) || null,
        resolvedImage: resolved,
    };
}

type CompositeCanvasImage = {
    resolvedImage: ResolvedCanvasImage;
    imageUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

type CompositeCanvasExport = {
    images: CompositeCanvasImage[];
    pageWidth: number;
    pageHeight: number;
};

/**
 * Positions every painting image on a composite canvas (a canvas with more
 * than one image) onto a single page-sized raster. Canvases with a single
 * image keep using `getCanvasExportResource`'s existing single-image path,
 * which preserves that path's wide-canvas/level0 request-size handling and
 * avoids an unnecessary decode/re-encode round trip for the common case.
 */
function getCompositeCanvasImages(
    canvas: any,
    targetWidth: number,
    getSelectedChoice?: (canvasId: string) => string | undefined,
): CompositeCanvasExport | null {
    const resolvedImages = resolveAllCanvasImages(canvas, {
        getSelectedChoice,
    });
    if (resolvedImages.length < 2) {
        return null;
    }

    const { canvasWidth, canvasHeight } = resolvedImages[0];
    if (!canvasWidth || !canvasHeight) {
        return null;
    }

    const scale = targetWidth / canvasWidth;
    const pageWidth = Math.max(1, Math.round(canvasWidth * scale));
    const pageHeight = Math.max(1, Math.round(canvasHeight * scale));

    const images: CompositeCanvasImage[] = [];
    for (const resolvedImage of resolvedImages) {
        const placement = getCompositeImagePlacement(
            resolvedImage,
            canvasWidth,
            canvasHeight,
            scale,
        );
        const imageUrl = getResolvedImageExportUrl(resolvedImage, {
            width: placement.width,
        });

        if (!imageUrl) {
            return null;
        }

        images.push({
            resolvedImage,
            imageUrl,
            ...placement,
        });
    }

    return { images, pageWidth, pageHeight };
}

function wrapText(
    text: string,
    font: any,
    size: number,
    maxWidth: number,
): WrappedLine[] {
    // Force text to plain string to avoid Svelte proxy issues
    const plainText = String(text);
    const paragraphs = plainText.split(/\r?\n/);
    const lines: WrappedLine[] = [];

    // Ensure paragraphs is a plain array (might be Svelte proxy)
    for (const paragraph of Array.from(paragraphs)) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (!words.length) {
            lines.push({ text: '', width: 0 });
            continue;
        }

        let currentLine = words[0];
        for (let index = 1; index < words.length; index += 1) {
            const candidate = `${currentLine} ${words[index]}`;
            const candidateWidth = font.widthOfTextAtSize(candidate, size);
            if (candidateWidth <= maxWidth) {
                currentLine = candidate;
                continue;
            }

            lines.push({
                text: currentLine,
                width: font.widthOfTextAtSize(currentLine, size),
            });
            currentLine = words[index];
        }

        lines.push({
            text: currentLine,
            width: font.widthOfTextAtSize(currentLine, size),
        });
    }

    return lines;
}

export function buildCoverSheetFields(
    coverSheet: PdfCoverSheetConfig,
    runtimeValues: CoverSheetRuntimeValues,
): PdfCoverSheetField[] {
    const fields = normalizeCoverSheetFields(coverSheet.fields);

    fields.push({
        label: 'Created',
        value: String(formatCreationDate(runtimeValues.createdAt)),
    });

    if (runtimeValues.currentUrl) {
        fields.push({
            label: 'Source URL',
            value: String(runtimeValues.currentUrl),
        });
    }

    return fields;
}

export function buildPdfFilename(params: {
    manifestId: string | null;
    manifestLabel?: string | null;
    startIndex: number;
    endIndex: number;
}): string {
    const base = getManifestFilenameBase(
        params.manifestId,
        params.manifestLabel,
    );
    return `${base}-${params.startIndex + 1}-${params.endIndex + 1}.pdf`;
}

export function normalizeCanvasRange(
    startIndex: number,
    endIndex: number,
    canvasCount: number,
): NormalizeCanvasRangeResult | null {
    if (canvasCount < 1) {
        return null;
    }

    const maxIndex = canvasCount - 1;
    const start = Math.min(Math.max(0, startIndex), maxIndex);
    const end = Math.min(Math.max(0, endIndex), maxIndex);
    const normalizedStart = Math.min(start, end);
    const normalizedEnd = Math.max(start, end);
    const indices: number[] = [];

    for (let index = normalizedStart; index <= normalizedEnd; index += 1) {
        indices.push(index);
    }

    return {
        startIndex: normalizedStart,
        endIndex: normalizedEnd,
        indices,
    };
}

export function extractOcrTextOverlays(annotations: any[]): PdfTextOverlay[] {
    return annotations
        .map((annotation, index): PdfTextOverlay | null => {
            const parsed = parseAnnotation(annotation, index);
            if (!parsed || parsed.geometry.type !== 'RECTANGLE') {
                return null;
            }

            const bodies = getTextBodies(annotation);
            if (!bodies.length || !isOcrAnnotation(annotation, bodies)) {
                return null;
            }

            const text = bodies
                .map((body) => body.value.trim())
                .filter(Boolean)
                .join(' ');

            if (!text) {
                return null;
            }

            return {
                text,
                x: parsed.geometry.x,
                y: parsed.geometry.y,
                width: parsed.geometry.w,
                height: parsed.geometry.h,
                coordinateSpace: 'image',
            };
        })
        .filter((overlay): overlay is PdfTextOverlay => overlay !== null);
}

function getResolvedImageDimensions(
    resolvedImage: ResolvedCanvasImage | null | undefined,
): { width: number; height: number } | null {
    if (
        typeof resolvedImage?.resourceWidth !== 'number' ||
        typeof resolvedImage?.resourceHeight !== 'number'
    ) {
        return null;
    }

    return {
        width: resolvedImage.resourceWidth,
        height: resolvedImage.resourceHeight,
    };
}

function normalizeOverlayToCanvasSpace({
    overlay,
    canvasDimensions,
    imageDimensions,
}: {
    overlay: PdfTextOverlay;
    canvasDimensions: { width: number; height: number };
    imageDimensions: { width: number; height: number } | null;
}): PdfTextOverlay {
    if (overlay.coordinateSpace !== 'image' || !imageDimensions) {
        return overlay;
    }

    return {
        ...overlay,
        x: (overlay.x * canvasDimensions.width) / imageDimensions.width,
        y: (overlay.y * canvasDimensions.height) / imageDimensions.height,
        width: (overlay.width * canvasDimensions.width) / imageDimensions.width,
        height:
            (overlay.height * canvasDimensions.height) / imageDimensions.height,
        coordinateSpace: 'canvas',
    };
}

async function convertBlobToPng(blob: Blob): Promise<Uint8Array> {
    const image = await loadImageElement(blob);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Unable to create a canvas for image conversion.');
    }

    context.drawImage(image, 0, 0);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
            if (value) {
                resolve(value);
                return;
            }

            reject(new Error('Unable to convert image to PNG for PDF export.'));
        }, 'image/png');
    });

    return new Uint8Array(await pngBlob.arrayBuffer());
}

export function buildImageRequestInit(
    imageRequest: PdfImageRequestConfig = {},
): RequestInit {
    return {
        credentials: 'same-origin',
        ...imageRequest,
    };
}

async function loadCanvasImageBlob({
    canvas,
    canvasId,
    imageUrl,
    manifestId,
    targetWidth,
    imageRequest,
    resolvedImage,
    loadImageBlob,
    imageWidth,
}: PdfImageLoaderParams & {
    loadImageBlob?: PdfImageLoader;
    /**
     * The width this particular image occupies, where that differs from the
     * page's `targetWidth` — a member image of a composite canvas. Internal:
     * `PdfImageLoaderParams.targetWidth` is what a host-supplied loader is
     * documented to receive and keeps meaning the page target.
     */
    imageWidth?: number;
}): Promise<Blob> {
    if (loadImageBlob) {
        return loadImageBlob({
            canvas,
            canvasId,
            imageUrl,
            manifestId,
            targetWidth,
            imageRequest,
            resolvedImage,
        });
    }

    // A level0 service cannot be asked for anything through a URL derived from
    // the manifest. Which resolutions exist, and the base URI to request them
    // at, live only in `info.json` — an auth gateway signs that base, so it need
    // not match the advertised service id — and a static tile tree may hold the
    // wanted resolution only as tiles. Core's export seam owns all of it, and is
    // the same code the image-download plugin retrieves through, so the two
    // cannot drift. Sending `imageUrl` here instead would fetch whatever single
    // image the manifest happened to publish: for a signed tile tree, a
    // thumbnail on a different host, silently embedded at page size.
    if (resolvedImage && isLevel0ImageService(resolvedImage.serviceProfile)) {
        return fetchExportImageBlob(resolvedImage, {
            width: imageWidth ?? targetWidth,
            imageRequest: buildImageRequestInit(imageRequest),
        });
    }

    return fetchImageBlob(imageUrl, buildImageRequestInit(imageRequest));
}

async function embedImage(pdfDoc: any, blob: Blob) {
    const mimeType = blob.type.toLowerCase();

    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return pdfDoc.embedJpg(bytes);
    }

    if (mimeType.includes('png')) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return pdfDoc.embedPng(bytes);
    }

    const pngBytes = await convertBlobToPng(blob);
    return pdfDoc.embedPng(pngBytes);
}

async function addCoverSheetPage(
    pdfDoc: any,
    coverSheet: PdfCoverSheetConfig,
    runtimeValues: CoverSheetRuntimeValues,
): Promise<void> {
    const page = pdfDoc.addPage(COVER_PAGE_SIZE);
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const labelFont = titleFont;
    const valueFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const contentWidth = pageWidth - COVER_MARGIN_X * 2;
    const labelColumnWidth = 140;
    const valueColumnWidth = contentWidth - labelColumnWidth - 24;
    let y = pageHeight - COVER_MARGIN_Y;

    page.drawText(coverSheet.title || 'Export Summary', {
        x: COVER_MARGIN_X,
        y,
        size: COVER_TITLE_SIZE,
        font: titleFont,
    });
    y -= 26;

    page.drawLine({
        start: { x: COVER_MARGIN_X, y },
        end: { x: pageWidth - COVER_MARGIN_X, y },
        thickness: 1,
    });
    y -= 28;

    // Ensure buildCoverSheetFields result is a plain array (might be Svelte proxy)
    const fields: PdfCoverSheetField[] = Array.from(
        buildCoverSheetFields(coverSheet, runtimeValues),
    );

    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
        const field = fields[fieldIndex];

        const labelLines = wrapText(
            field.label,
            labelFont,
            COVER_LABEL_SIZE,
            labelColumnWidth,
        );
        const valueLines = wrapText(
            field.value,
            valueFont,
            COVER_VALUE_SIZE,
            valueColumnWidth,
        );
        const rowLines = Math.max(labelLines.length, valueLines.length);
        const rowHeight = rowLines * 16 + 12;

        if (y - rowHeight < COVER_MARGIN_Y) {
            break;
        }

        labelLines.forEach((line, index) => {
            page.drawText(line.text, {
                x: COVER_MARGIN_X,
                y: y - index * 16,
                size: COVER_LABEL_SIZE,
                font: labelFont,
            });
        });

        valueLines.forEach((line, index) => {
            page.drawText(line.text, {
                x: COVER_MARGIN_X + labelColumnWidth + 24,
                y: y - index * 16,
                size: COVER_VALUE_SIZE,
                font: valueFont,
            });
        });

        y -= rowHeight;
    }
}

async function addSelectableTextLayer(
    page: any,
    pdfDoc: any,
    overlays: PdfTextOverlay[],
    canvasDimensions: { width: number; height: number },
    ocrOptions: PdfOcrRenderOptions,
    options: {
        canvasId?: string;
        label?: string;
        resolvedImage?: ResolvedCanvasImage | null;
    } = {},
): Promise<void> {
    if (!overlays.length) {
        return;
    }

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const scaleX = pageWidth / canvasDimensions.width;
    const scaleY = pageHeight / canvasDimensions.height;
    const imageDimensions = getResolvedImageDimensions(options.resolvedImage);

    // Ensure overlays is a plain array (might be Svelte proxy)
    for (const overlay of Array.from(overlays)) {
        // When image-space overlays arrive without source image dimensions we
        // fall back to legacy canvas-space placement (best effort, silent).
        const normalizedOverlay = normalizeOverlayToCanvasSpace({
            overlay,
            canvasDimensions,
            imageDimensions,
        });
        const layout = getOcrWordLayout({
            overlay: normalizedOverlay,
            font,
            pageHeight,
            scaleX,
            scaleY,
            placementMode: ocrOptions.placementMode,
            sizingMode: ocrOptions.sizingMode,
        });

        if (layout.fontSize < 1) {
            continue;
        }

        drawOcrText(page, overlay.text, {
            x: layout.x,
            y: layout.y,
            size: layout.fontSize,
            font,
            visibilityMode: ocrOptions.visibilityMode,
        });
    }
}

function normalizeOcrRenderOptions(options: {
    ocrPlacementMode?: PdfOcrPlacementMode;
    ocrSizingMode?: PdfOcrSizingMode;
    ocrVisibilityMode?: PdfOcrVisibilityMode;
}): PdfOcrRenderOptions {
    return {
        placementMode:
            options.ocrPlacementMode ||
            DEFAULT_OCR_RENDER_OPTIONS.placementMode,
        sizingMode:
            options.ocrSizingMode || DEFAULT_OCR_RENDER_OPTIONS.sizingMode,
        visibilityMode:
            options.ocrVisibilityMode ||
            DEFAULT_OCR_RENDER_OPTIONS.visibilityMode,
    };
}

function getOcrWordLayout({
    overlay,
    font,
    pageHeight,
    scaleX,
    scaleY,
    placementMode,
    sizingMode,
}: {
    overlay: PdfTextOverlay;
    font: any;
    pageHeight: number;
    scaleX: number;
    scaleY: number;
    placementMode: PdfOcrPlacementMode;
    sizingMode: PdfOcrSizingMode;
}): OcrWordLayout {
    const width = overlay.width * scaleX;
    const height = overlay.height * scaleY;
    const x = overlay.x * scaleX;
    const fontSize = getFontSizeToFit(
        font,
        overlay.text,
        width,
        height,
        sizingMode,
    );
    const renderedHeight = font.heightAtSize(fontSize, {
        descender: false,
    });

    if (placementMode === 'word-anchor') {
        return {
            x,
            y: pageHeight - overlay.y * scaleY - renderedHeight,
            width,
            height,
            fontSize,
            renderedHeight,
        };
    }

    const y = pageHeight - (overlay.y + overlay.height) * scaleY;

    return {
        x,
        y: y + Math.max(0, (height - renderedHeight) * 0.5),
        width,
        height,
        fontSize,
        renderedHeight,
    };
}

function drawOcrText(
    page: any,
    text: string,
    options: {
        x: number;
        y: number;
        size: number;
        font: any;
        visibilityMode: PdfOcrVisibilityMode;
    },
): void {
    const drawOptions = {
        x: options.x,
        y: options.y,
        size: options.size,
        font: options.font,
    };

    if (options.visibilityMode === 'debug') {
        page.drawText(text, {
            ...drawOptions,
            color: rgb(1, 0, 0),
            opacity: 1,
        });
        return;
    }

    if (
        options.visibilityMode === 'invisible' &&
        typeof page.pushOperators === 'function'
    ) {
        page.pushOperators(
            pushGraphicsState(),
            setTextRenderingMode(TextRenderingMode.Invisible),
        );
        page.drawText(text, drawOptions);
        page.pushOperators(popGraphicsState());
        return;
    }

    page.drawText(text, {
        ...drawOptions,
        opacity: 0.001,
    });
}

async function resolveCanvasOcrOverlays({
    canvas,
    canvasId,
    canvasIndex,
    manifestId,
    getCanvasOcrOverlays,
    getCanvasAnnotations,
}: {
    canvas: any;
    canvasId: string;
    canvasIndex: number;
    manifestId: string | null;
    label: string;
    getCanvasOcrOverlays?: PdfCanvasOcrOverlayProvider;
    getCanvasAnnotations?: (canvasId: string) => Promise<any[]> | any[];
}): Promise<PdfTextOverlay[]> {
    if (getCanvasOcrOverlays) {
        try {
            const overlays = await getCanvasOcrOverlays({
                manifestId,
                canvasId,
                canvas,
                canvasIndex,
            });
            if (overlays != null) {
                if (!Array.isArray(overlays)) {
                    // Invalid provider result: ignore and fall through to the
                    // manifest-annotation path (best effort, silent).
                    return [];
                }

                return Array.from(overlays);
            }
        } catch {
            // Provider threw: fall back to manifest annotations (best effort).
        }
    }

    if (!getCanvasAnnotations) {
        return [];
    }

    return extractOcrTextOverlays(await getCanvasAnnotations(canvasId));
}

function getRuntimeValues(
    createdAt?: Date,
    currentUrl?: string | null,
): CoverSheetRuntimeValues {
    return {
        createdAt: createdAt || new Date(),
        currentUrl:
            currentUrl !== undefined
                ? currentUrl
                : typeof window !== 'undefined'
                  ? window.location.href
                  : null,
    };
}

export async function exportCanvasRangeAsPdf({
    canvases,
    startIndex,
    endIndex,
    targetWidth,
    manifestId,
    manifestLabel,
    getSelectedChoice,
    getCanvasOcrOverlays,
    getCanvasAnnotations,
    imageRequest,
    loadImageBlob,
    ocrPlacementMode,
    ocrSizingMode,
    ocrVisibilityMode,
    filename,
    getFilename,
    coverSheet,
    createdAt,
    currentUrl,
    onProgress,
    messages = DEFAULT_PDF_EXPORT_MESSAGES,
}: ExportCanvasRangeAsPdfParams): Promise<ExportCanvasRangeAsPdfResult> {
    const range = normalizeCanvasRange(startIndex, endIndex, canvases.length);
    if (!range) {
        throw new Error(messages.errorNoCanvases());
    }

    const { PDFDocument } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const failedCanvases: string[] = [];
    let exportedCount = 0;
    const ocrRenderOptions = normalizeOcrRenderOptions({
        ocrPlacementMode,
        ocrSizingMode,
        ocrVisibilityMode,
    });

    const coverSheetFields = normalizeCoverSheetFields(coverSheet?.fields);

    if (coverSheet && coverSheetFields.length > 0) {
        onProgress?.(messages.progressCoverSheet());
        await addCoverSheetPage(
            pdfDoc,
            coverSheet,
            getRuntimeValues(createdAt, currentUrl),
        );
    }

    // Ensure indices is a plain array (might be Svelte proxy or reactive wrapper)
    //
    // Canvases core cannot paint any of — the **unsupported presentation** —
    // are dropped from the range here rather than failing inside the loop:
    // there was never an image to fetch, so they are not a partial export, and
    // an entry in `failedCanvases` would report a manifest doing exactly what
    // it says it does as something gone wrong. Dropping them before the loop
    // is also what keeps the poster thumbnail out of the PDF, which the
    // single-image path would otherwise fall through to.
    const plainIndices = (
        Array.isArray(range.indices) ? Array.from(range.indices) : []
    ).filter((index) => !isUnsupportedCanvas(canvases[index]));

    for (const [offset, index] of plainIndices.entries()) {
        const canvas = canvases[index];
        const label = getCanvasLabel(canvas, index);
        onProgress?.(
            messages.progressCanvas({
                current: offset + 1,
                total: plainIndices.length,
                label,
            }),
        );

        try {
            const canvasId = getCanvasId(canvas);
            const requestInit = buildImageRequestInit(imageRequest);
            const composite = getCompositeCanvasImages(
                canvas,
                targetWidth,
                getSelectedChoice,
            );

            let blob: Blob;
            let resolvedImage: ResolvedCanvasImage | null;

            if (composite) {
                // Composite canvas (more than one painting image): fetch
                // every image and rasterize them together onto one page
                // image at their annotated positions.
                const composeEntries = await Promise.all(
                    composite.images.map(async (image) => ({
                        blob: await loadCanvasImageBlob({
                            canvas,
                            canvasId,
                            imageUrl: image.imageUrl,
                            manifestId,
                            targetWidth,
                            imageRequest: requestInit,
                            resolvedImage: image.resolvedImage,
                            loadImageBlob,
                            // The box this member image occupies on the page,
                            // not the page width: a level0 source is served
                            // from the nearest resolution it actually holds.
                            imageWidth: image.width,
                        }),
                        x: image.x,
                        y: image.y,
                        width: image.width,
                        height: image.height,
                    })),
                );
                blob = await composeImages(
                    composeEntries,
                    composite.pageWidth,
                    composite.pageHeight,
                );
                // No single resolved image drives OCR image-space
                // normalization for a composite page; overlays supplied
                // in canvas coordinate space (the default) are unaffected.
                resolvedImage = null;
            } else {
                const singleImage = getCanvasExportResource(
                    canvas,
                    targetWidth,
                    getSelectedChoice,
                );

                if (!singleImage.imageUrl) {
                    throw new Error(
                        'No exportable image found for this canvas.',
                    );
                }

                blob = await loadCanvasImageBlob({
                    canvas,
                    canvasId,
                    imageUrl: singleImage.imageUrl,
                    manifestId,
                    targetWidth,
                    imageRequest: requestInit,
                    resolvedImage: singleImage.resolvedImage,
                    loadImageBlob,
                });
                resolvedImage = singleImage.resolvedImage;
            }

            const embeddedImage = await embedImage(pdfDoc, blob);
            const page = pdfDoc.addPage([
                embeddedImage.width,
                embeddedImage.height,
            ]);
            page.drawImage(embeddedImage, {
                x: 0,
                y: 0,
                width: embeddedImage.width,
                height: embeddedImage.height,
            });

            const canvasDimensions = getDeclaredCanvasDimensions(canvas);
            const overlays =
                canvasId && (getCanvasOcrOverlays || getCanvasAnnotations)
                    ? await resolveCanvasOcrOverlays({
                          canvas,
                          canvasId,
                          canvasIndex: index,
                          manifestId,
                          label,
                          getCanvasOcrOverlays,
                          getCanvasAnnotations,
                      })
                    : [];
            if (canvasDimensions && overlays.length) {
                try {
                    await addSelectableTextLayer(
                        page,
                        pdfDoc,
                        overlays,
                        canvasDimensions,
                        ocrRenderOptions,
                        {
                            canvasId,
                            label,
                            resolvedImage,
                        },
                    );
                } catch {
                    // Keep the raster page export even if OCR text
                    // embedding fails (best effort, silent).
                }
            }

            exportedCount += 1;
        } catch (error) {
            // A CORS/auth failure is fatal for the whole export (every
            // canvas would fail the same way): surface it to the caller,
            // which reports it on the structured error channel.
            if (isCrossOriginImageFailure(error)) {
                throw new Error(messages.errorNotAvailable());
            }
            // A single-canvas failure is non-fatal: record it so the
            // caller can report a partial export via `failedCanvases`.
            failedCanvases.push(label);
        }
    }

    if (!exportedCount) {
        throw new Error(messages.errorNoCanvasesExported());
    }

    const defaultFilename = buildPdfFilename({
        manifestId,
        manifestLabel,
        startIndex: range.startIndex,
        endIndex: range.endIndex,
    });
    const dynamicFilename = filename
        ? null
        : await getFilename?.({
              manifestId,
              manifestLabel,
              startIndex: range.startIndex,
              endIndex: range.endIndex,
              indices: plainIndices,
              canvases: plainIndices.map((index) => canvases[index]),
              exportedCount,
              failedCanvases,
              defaultFilename,
          });
    const finalFilename =
        filename ||
        (typeof dynamicFilename === 'string' && dynamicFilename
            ? dynamicFilename
            : defaultFilename);

    onProgress?.(messages.progressDownload({ filename: finalFilename }));
    const pdfBytes = await pdfDoc.save();
    const pdfArray = Uint8Array.from(pdfBytes);
    downloadBlob(
        new Blob([pdfArray.buffer], { type: 'application/pdf' }),
        finalFilename,
    );

    return {
        exportedCount,
        failedCanvases,
        filename: finalFilename,
    };
}
