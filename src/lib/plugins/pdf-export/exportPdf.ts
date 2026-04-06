import { StandardFonts } from 'pdf-lib';

import { parseAnnotation } from '../../utils/annotationAdapter';
import { getThumbnailSrc } from '../../utils/getThumbnailSrc';
import {
    buildIiifImageRequestUrl,
    getCanvasId,
    getCanvasLabel,
    resolveCanvasImage,
} from '../../utils/resolveCanvasImage';
import type { ResolvedCanvasImage } from '../../utils/resolveCanvasImage';

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
};

type ExportCanvasRangeAsPdfParams = {
    canvases: any[];
    startIndex: number;
    endIndex: number;
    targetWidth: number;
    manifestId: string | null;
    manifestLabel?: string | null;
    getSelectedChoice?: (canvasId: string) => string | undefined;
    getCanvasAnnotations?: (canvasId: string) => Promise<any[]> | any[];
    imageRequest?: PdfImageRequestConfig;
    loadImageBlob?: PdfImageLoader;
    filename?: string;
    coverSheet?: PdfCoverSheetConfig;
    createdAt?: Date;
    currentUrl?: string | null;
    onProgress?: (message: string) => void;
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

const COVER_PAGE_SIZE: [number, number] = [612, 792];
const COVER_MARGIN_X = 56;
const COVER_MARGIN_Y = 64;
const COVER_LABEL_SIZE = 11;
const COVER_VALUE_SIZE = 12;
const COVER_TITLE_SIZE = 22;

function sanitizeFilenamePart(value: string): string {
    return value
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

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

function describeValueShape(value: unknown): string {
    if (Array.isArray(value)) {
        return `array(${value.length})`;
    }

    if (value === null) {
        return 'null';
    }

    return typeof value;
}

function normalizeCoverSheetFields(fields: unknown): PdfCoverSheetField[] {
    if (Array.isArray(fields)) {
        console.debug(
            '[PDF export] Normalizing cover sheet fields from array',
            {
                length: fields.length,
            },
        );

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

            console.warn(
                '[PDF export] Ignoring unsupported cover sheet entry',
                {
                    shape: describeValueShape(field),
                    entry: field,
                },
            );
            return [];
        });
    }

    if (isPdfCoverSheetField(fields)) {
        console.debug('[PDF export] Normalizing cover sheet field object');
        return [{ ...fields }];
    }

    if (fields && typeof fields === 'object') {
        console.debug(
            '[PDF export] Normalizing cover sheet fields from object map',
            {
                keys: Object.keys(fields),
            },
        );
        return Object.entries(fields).flatMap(([label, value]) => {
            if (value == null) {
                return [];
            }

            return [{ label, value: String(value) }];
        });
    }

    if (fields !== undefined) {
        console.warn('[PDF export] Unsupported cover sheet fields input', {
            shape: describeValueShape(fields),
            fields,
        });
    }

    return [];
}

function getMotivations(annotation: any): string[] {
    const raw =
        annotation?.motivation ||
        annotation?.__jsonld?.motivation ||
        (typeof annotation?.getMotivation === 'function'
            ? annotation.getMotivation()
            : null);

    if (!raw) {
        return [];
    }

    return (Array.isArray(raw) ? raw : [raw]).map((value) => String(value));
}

function getBodyCandidates(annotation: any): any[] {
    const rawBody =
        annotation?.body || annotation?.resource || annotation?.__jsonld?.body;
    if (rawBody) {
        return Array.isArray(rawBody) ? rawBody : [rawBody];
    }

    if (typeof annotation?.getBody === 'function') {
        const body = annotation.getBody();
        return Array.isArray(body) ? body : body ? [body] : [];
    }

    return [];
}

function getTextBodies(annotation: any): TextBody[] {
    return getBodyCandidates(annotation)
        .map((body): TextBody | null => {
            const value =
                body?.value ||
                body?.chars ||
                (typeof body?.getValue === 'function' ? body.getValue() : null);
            if (typeof value !== 'string' || !value.trim()) {
                return null;
            }

            const format =
                body?.format ||
                (typeof body?.getFormat === 'function'
                    ? body.getFormat()
                    : undefined);
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

function getCanvasDimensions(
    canvas: any,
): { width: number; height: number } | null {
    const width =
        canvas?.width ||
        canvas?.__jsonld?.width ||
        (typeof canvas?.getWidth === 'function' ? canvas.getWidth() : null);
    const height =
        canvas?.height ||
        canvas?.__jsonld?.height ||
        (typeof canvas?.getHeight === 'function' ? canvas.getHeight() : null);

    if (typeof width !== 'number' || typeof height !== 'number') {
        return null;
    }

    return { width, height };
}

function getFontSizeToFit(
    font: any,
    text: string,
    width: number,
    height: number,
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
    if (
        resolved?.resourceId &&
        (resolved.serviceProfile === 'level0' ||
            resolved.serviceProfile?.endsWith('/level0.json'))
    ) {
        return { imageUrl: resolved.resourceId, resolvedImage: resolved };
    }

    if (resolved?.serviceId) {
        return {
            imageUrl: buildIiifImageRequestUrl(resolved.serviceId, {
                width: targetWidth,
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

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function wrapText(
    text: string,
    font: any,
    size: number,
    maxWidth: number,
): WrappedLine[] {
    const paragraphs = text.split(/\r?\n/);
    const lines: WrappedLine[] = [];

    for (const paragraph of paragraphs) {
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
        value: formatCreationDate(runtimeValues.createdAt),
    });

    if (runtimeValues.currentUrl) {
        fields.push({
            label: 'Source URL',
            value: runtimeValues.currentUrl,
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
        .map((annotation, index) => {
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
            };
        })
        .filter((overlay): overlay is PdfTextOverlay => overlay !== null);
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
    const objectUrl = URL.createObjectURL(blob);

    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () =>
                reject(new Error('Unable to decode image for PDF export.'));
            element.src = objectUrl;
        });

        return image;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

async function convertBlobToPng(blob: Blob): Promise<Uint8Array> {
    const image = await loadImage(blob);
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

function isLikelyCorsOrAuthFailure(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    return (
        error.name === 'TypeError' ||
        /failed to fetch/i.test(error.message) ||
        /networkerror/i.test(error.message)
    );
}

async function fetchImageBlobWithConfig(
    url: string,
    imageRequest?: PdfImageRequestConfig,
): Promise<Blob> {
    const response = await fetch(url, buildImageRequestInit(imageRequest));
    if (!response.ok) {
        throw new Error(`Image request failed with ${response.status}.`);
    }

    return response.blob();
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
}: PdfImageLoaderParams & { loadImageBlob?: PdfImageLoader }): Promise<Blob> {
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

    return fetchImageBlobWithConfig(imageUrl, imageRequest);
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
    const [pageWidth, pageHeight] = page.getSize();
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

    for (const field of buildCoverSheetFields(coverSheet, runtimeValues)) {
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
): Promise<void> {
    if (!overlays.length) {
        return;
    }

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const scaleX = pageWidth / canvasDimensions.width;
    const scaleY = pageHeight / canvasDimensions.height;

    for (const overlay of overlays) {
        const width = overlay.width * scaleX;
        const height = overlay.height * scaleY;
        const x = overlay.x * scaleX;
        const y = pageHeight - (overlay.y + overlay.height) * scaleY;
        const fontSize = getFontSizeToFit(font, overlay.text, width, height);

        if (fontSize < 1) {
            continue;
        }

        const renderedHeight = font.heightAtSize(fontSize, {
            descender: false,
        });

        page.drawText(overlay.text, {
            x,
            y: y + Math.max(0, (height - renderedHeight) * 0.5),
            size: fontSize,
            font,
            opacity: 0.001,
        });
    }
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
    getCanvasAnnotations,
    imageRequest,
    loadImageBlob,
    filename,
    coverSheet,
    createdAt,
    currentUrl,
    onProgress,
}: ExportCanvasRangeAsPdfParams): Promise<ExportCanvasRangeAsPdfResult> {
    console.debug('[PDF export] Starting export', {
        canvasCount: canvases.length,
        startIndex,
        endIndex,
        manifestId,
        hasCoverSheet: !!coverSheet,
        coverSheetFieldShape: describeValueShape(coverSheet?.fields),
    });

    const range = normalizeCanvasRange(startIndex, endIndex, canvases.length);
    if (!range) {
        throw new Error('No canvases available to export.');
    }

    const { PDFDocument } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const failedCanvases: string[] = [];
    let exportedCount = 0;

    const coverSheetFields = normalizeCoverSheetFields(coverSheet?.fields);

    if (coverSheet && coverSheetFields.length > 0) {
        console.debug('[PDF export] Adding cover sheet page', {
            fieldCount: coverSheetFields.length,
            title: coverSheet.title || 'Export Summary',
        });
        onProgress?.('Preparing cover sheet...');
        await addCoverSheetPage(
            pdfDoc,
            coverSheet,
            getRuntimeValues(createdAt, currentUrl),
        );
    } else if (coverSheet) {
        console.debug(
            '[PDF export] Skipping cover sheet page because no usable fields were found',
        );
    }

    for (const [offset, index] of range.indices.entries()) {
        const canvas = canvases[index];
        const label = getCanvasLabel(canvas, index);
        console.debug('[PDF export] Exporting canvas', {
            offset,
            index,
            label,
        });
        onProgress?.(
            `Exporting ${offset + 1} of ${range.indices.length}: ${label}`,
        );

        try {
            const { imageUrl, resolvedImage } = getCanvasExportResource(
                canvas,
                targetWidth,
                getSelectedChoice,
            );

            if (!imageUrl) {
                throw new Error('No exportable image found for this canvas.');
            }

            const canvasId = getCanvasId(canvas);
            const requestInit = buildImageRequestInit(imageRequest);
            const blob = await loadCanvasImageBlob({
                canvas,
                canvasId,
                imageUrl,
                manifestId,
                targetWidth,
                imageRequest: requestInit,
                resolvedImage,
                loadImageBlob,
            });
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

            const canvasDimensions = getCanvasDimensions(canvas);
            const annotations =
                canvasId && getCanvasAnnotations
                    ? await getCanvasAnnotations(canvasId)
                    : [];
            if (canvasDimensions && annotations.length) {
                try {
                    await addSelectableTextLayer(
                        page,
                        pdfDoc,
                        extractOcrTextOverlays(annotations),
                        canvasDimensions,
                    );
                } catch {
                    // Keep the raster page export even if OCR text embedding fails.
                }
            }

            exportedCount += 1;
        } catch (error) {
            if (isLikelyCorsOrAuthFailure(error)) {
                console.warn(
                    'PDF export blocked by image source access policy.',
                    error,
                );
                throw new Error(
                    'PDF export is not available for this item because the image source does not allow direct browser download access.',
                );
            }
            console.error('[PDF export] Failed to export canvas', {
                index,
                label,
                error,
            });
            failedCanvases.push(label);
        }
    }

    if (!exportedCount) {
        throw new Error('Unable to export any canvases to PDF.');
    }

    const finalFilename =
        filename ||
        buildPdfFilename({
            manifestId,
            manifestLabel,
            startIndex: range.startIndex,
            endIndex: range.endIndex,
        });

    onProgress?.(`Preparing download: ${finalFilename}`);
    console.debug('[PDF export] Saving PDF document', {
        filename: finalFilename,
        exportedCount,
        failedCount: failedCanvases.length,
    });
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
