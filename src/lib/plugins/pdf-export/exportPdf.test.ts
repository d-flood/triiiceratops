import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockPdfDoc: any;

vi.mock('pdf-lib', () => ({
    StandardFonts: {
        Helvetica: 'Helvetica',
        HelveticaBold: 'HelveticaBold',
    },
    TextRenderingMode: {
        Invisible: 'Invisible',
    },
    PDFDocument: {
        create: vi.fn(async () => mockPdfDoc),
    },
    popGraphicsState: vi.fn(() => ({ op: 'popGraphicsState' })),
    pushGraphicsState: vi.fn(() => ({ op: 'pushGraphicsState' })),
    rgb: vi.fn((r: number, g: number, b: number) => ({ type: 'rgb', r, g, b })),
    setTextRenderingMode: vi.fn((mode: string) => ({
        op: 'setTextRenderingMode',
        mode,
    })),
}));

import { TextRenderingMode } from 'pdf-lib';

import {
    buildCoverSheetFields,
    buildImageRequestInit,
    buildPdfFilename,
    exportCanvasRangeAsPdf,
    extractOcrTextOverlays,
    normalizeCanvasRange,
} from './exportPdf';

function createMockPage() {
    return {
        drawImage: vi.fn(),
        drawText: vi.fn(),
        getSize: () => ({ width: 1000, height: 500 }),
        pushOperators: vi.fn(),
    };
}

function createMockPdfDoc(page = createMockPage()) {
    const font = {
        heightAtSize: (size: number) => size * 0.8,
        widthOfTextAtSize: (text: string, size: number) =>
            Math.max(1, text.length * size * 0.5),
    };

    return {
        page,
        addPage: vi.fn(() => page),
        embedFont: vi.fn(async () => font),
        embedPng: vi.fn(async () => ({ width: 1000, height: 500 })),
        embedJpg: vi.fn(async () => ({ width: 1000, height: 500 })),
        save: vi.fn(async () => new Uint8Array([1, 2, 3])),
    };
}

function createCanvas(id: string, label = id) {
    return {
        id,
        label,
        width: 1000,
        height: 500,
        getImages: () => [
            {
                body: {
                    id: `https://example.org/${encodeURIComponent(id)}.png`,
                    type: 'Image',
                    format: 'image/png',
                    width: 1000,
                    height: 500,
                },
            },
        ],
    };
}

function createCanvasWithImage(
    id: string,
    canvasDimensions: { width: number; height: number },
    imageDimensions?: { width: number; height: number },
) {
    return {
        id,
        label: id,
        width: canvasDimensions.width,
        height: canvasDimensions.height,
        getImages: () => [
            {
                body: {
                    id: `https://example.org/${encodeURIComponent(id)}.png`,
                    type: 'Image',
                    format: 'image/png',
                    ...(imageDimensions || {}),
                },
            },
        ],
    };
}

function createIiifCanvas(
    id: string,
    dimensions: { width: number; height: number },
) {
    return {
        id,
        width: dimensions.width,
        height: dimensions.height,
        getContent: () => [
            {
                getBody: () => ({
                    id: `https://example.org/static/${encodeURIComponent(id)}.jpg`,
                    type: 'Image',
                    service: {
                        id: `https://example.org/iiif/${encodeURIComponent(id)}`,
                        type: 'ImageService3',
                    },
                }),
            },
        ],
    };
}

function createOcrAnnotation(text: string) {
    return {
        id: `ocr-${text}`,
        motivation: 'supplementing',
        body: {
            type: 'TextualBody',
            value: text,
            format: 'text/plain',
        },
        target: 'https://example.org/canvas/1#xywh=10,20,300,40',
    };
}

function createImageBlob() {
    return new Blob([new Uint8Array([137, 80, 78, 71])], {
        type: 'image/png',
    });
}

function getDrawnTexts(page: { drawText: ReturnType<typeof vi.fn> }) {
    return page.drawText.mock.calls.map(([text]) => text);
}

function getLastDrawTextOptions(page: { drawText: ReturnType<typeof vi.fn> }) {
    const lastCall = page.drawText.mock.calls.at(-1);
    return lastCall?.[1];
}

describe('exportCanvasRangeAsPdf', () => {
    let createObjectUrlSpy: ReturnType<typeof vi.spyOn>;
    let revokeObjectUrlSpy: ReturnType<typeof vi.spyOn>;
    let anchorClickSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        const page = createMockPage();
        mockPdfDoc = createMockPdfDoc(page);
        createObjectUrlSpy = vi
            .spyOn(URL, 'createObjectURL')
            .mockReturnValue('blob:mock-pdf');
        revokeObjectUrlSpy = vi
            .spyOn(URL, 'revokeObjectURL')
            .mockImplementation(() => {});
        anchorClickSpy = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => {});
    });

    afterEach(() => {
        createObjectUrlSpy.mockRestore();
        revokeObjectUrlSpy.mockRestore();
        anchorClickSpy.mockRestore();
        vi.restoreAllMocks();
    });

    it('uses getCanvasOcrOverlays and skips manifest annotations', async () => {
        const getCanvasAnnotations = vi.fn(() => [
            createOcrAnnotation('fallback'),
        ]);
        const getCanvasOcrOverlays = vi.fn(() => [
            {
                text: 'provider text',
                x: 10,
                y: 20,
                width: 300,
                height: 40,
            },
        ]);

        await exportCanvasRangeAsPdf({
            canvases: [createCanvas('canvas-1')],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            getCanvasOcrOverlays,
            getCanvasAnnotations,
            loadImageBlob: () => createImageBlob(),
        });

        expect(getCanvasOcrOverlays).toHaveBeenCalledWith({
            manifestId: 'https://example.org/manifest',
            canvasId: 'canvas-1',
            canvas: expect.objectContaining({ id: 'canvas-1' }),
            canvasIndex: 0,
        });
        expect(getCanvasAnnotations).not.toHaveBeenCalled();
        expect(getDrawnTexts(mockPdfDoc.page)).toContain('provider text');
    });

    it('treats an empty overlay array as handled and skips fallback', async () => {
        const getCanvasAnnotations = vi.fn(() => [
            createOcrAnnotation('fallback'),
        ]);

        await exportCanvasRangeAsPdf({
            canvases: [createCanvas('canvas-1')],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            getCanvasOcrOverlays: () => [],
            getCanvasAnnotations,
            loadImageBlob: () => createImageBlob(),
        });

        expect(getCanvasAnnotations).not.toHaveBeenCalled();
        expect(getDrawnTexts(mockPdfDoc.page)).toEqual([]);
    });

    it('falls back to manifest annotations when the provider returns null', async () => {
        const getCanvasAnnotations = vi.fn(() => [
            createOcrAnnotation('fallback text'),
        ]);

        await exportCanvasRangeAsPdf({
            canvases: [createCanvas('canvas-1')],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            getCanvasOcrOverlays: () => null,
            getCanvasAnnotations,
            loadImageBlob: () => createImageBlob(),
        });

        expect(getCanvasAnnotations).toHaveBeenCalledWith('canvas-1');
        expect(getDrawnTexts(mockPdfDoc.page)).toContain('fallback text');
    });

    it('falls back to manifest annotations when the provider returns undefined', async () => {
        const getCanvasAnnotations = vi.fn(() => [
            createOcrAnnotation('fallback text'),
        ]);

        await exportCanvasRangeAsPdf({
            canvases: [createCanvas('canvas-1')],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            getCanvasOcrOverlays: () => undefined,
            getCanvasAnnotations,
            loadImageBlob: () => createImageBlob(),
        });

        expect(getCanvasAnnotations).toHaveBeenCalledWith('canvas-1');
        expect(getDrawnTexts(mockPdfDoc.page)).toContain('fallback text');
    });

    it('falls back when the provider throws and logs a warning', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const getCanvasAnnotations = vi.fn(() => [
            createOcrAnnotation('fallback text'),
        ]);

        await exportCanvasRangeAsPdf({
            canvases: [createCanvas('canvas-1')],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            getCanvasOcrOverlays: () => {
                throw new Error('provider failed');
            },
            getCanvasAnnotations,
            loadImageBlob: () => createImageBlob(),
        });

        expect(getCanvasAnnotations).toHaveBeenCalledWith('canvas-1');
        expect(getDrawnTexts(mockPdfDoc.page)).toContain('fallback text');
        expect(warnSpy).toHaveBeenCalledWith(
            '[PDF export] OCR overlay provider failed; falling back to manifest annotations',
            expect.objectContaining({ canvasId: 'canvas-1' }),
        );
    });

    it('calls the provider only for canvases in the selected export range', async () => {
        const getCanvasOcrOverlays = vi.fn(() => []);

        await exportCanvasRangeAsPdf({
            canvases: [
                createCanvas('canvas-1'),
                createCanvas('canvas-2'),
                createCanvas('canvas-3'),
            ],
            startIndex: 1,
            endIndex: 2,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            getCanvasOcrOverlays,
            loadImageBlob: () => createImageBlob(),
        });

        expect(getCanvasOcrOverlays).toHaveBeenCalledTimes(2);
        expect(getCanvasOcrOverlays).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ canvasId: 'canvas-2', canvasIndex: 1 }),
        );
        expect(getCanvasOcrOverlays).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ canvasId: 'canvas-3', canvasIndex: 2 }),
        );
    });

    it('normalizes manifest OCR overlays from image coordinates', async () => {
        const getCanvasAnnotations = vi.fn(() => [
            createOcrAnnotation('manifest image-space text'),
        ]);

        await exportCanvasRangeAsPdf({
            canvases: [
                createCanvasWithImage(
                    'canvas-1',
                    { width: 2000, height: 1000 },
                    { width: 1000, height: 500 },
                ),
            ],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            getCanvasAnnotations,
            ocrPlacementMode: 'word-anchor',
            ocrSizingMode: 'height-only',
            loadImageBlob: () => createImageBlob(),
        });

        expect(getLastDrawTextOptions(mockPdfDoc.page)).toEqual(
            expect.objectContaining({
                x: 10,
                y: 440,
                size: 50,
                opacity: 0.001,
            }),
        );
    });

    it('keeps provider overlays without coordinateSpace in legacy canvas space', async () => {
        await exportCanvasRangeAsPdf({
            canvases: [
                createCanvasWithImage(
                    'canvas-1',
                    { width: 2000, height: 1000 },
                    { width: 1000, height: 500 },
                ),
            ],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            ocrPlacementMode: 'word-anchor',
            ocrSizingMode: 'height-only',
            getCanvasOcrOverlays: () => [
                {
                    text: 'legacy provider text',
                    x: 10,
                    y: 20,
                    width: 300,
                    height: 40,
                },
            ],
            loadImageBlob: () => createImageBlob(),
        });

        expect(getLastDrawTextOptions(mockPdfDoc.page)).toEqual(
            expect.objectContaining({
                x: 5,
                y: 470,
                size: 25,
                opacity: 0.001,
            }),
        );
    });

    it('normalizes provider overlays marked as image-space', async () => {
        await exportCanvasRangeAsPdf({
            canvases: [
                createCanvasWithImage(
                    'canvas-1',
                    { width: 2000, height: 1000 },
                    { width: 1000, height: 500 },
                ),
            ],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            ocrPlacementMode: 'word-anchor',
            ocrSizingMode: 'height-only',
            getCanvasOcrOverlays: () => [
                {
                    text: 'image provider text',
                    x: 10,
                    y: 20,
                    width: 300,
                    height: 40,
                    coordinateSpace: 'image',
                },
            ],
            loadImageBlob: () => createImageBlob(),
        });

        expect(getLastDrawTextOptions(mockPdfDoc.page)).toEqual(
            expect.objectContaining({
                x: 10,
                y: 440,
                size: 50,
                opacity: 0.001,
            }),
        );
    });

    it('uses per-axis scaling for image-space overlays', async () => {
        await exportCanvasRangeAsPdf({
            canvases: [
                createCanvasWithImage(
                    'canvas-1',
                    { width: 2000, height: 1000 },
                    { width: 1000, height: 400 },
                ),
            ],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            ocrPlacementMode: 'word-anchor',
            ocrSizingMode: 'height-only',
            getCanvasOcrOverlays: () => [
                {
                    text: 'aspect test',
                    x: 10,
                    y: 20,
                    width: 300,
                    height: 40,
                    coordinateSpace: 'image',
                },
            ],
            loadImageBlob: () => createImageBlob(),
        });

        expect(getLastDrawTextOptions(mockPdfDoc.page)).toEqual(
            expect.objectContaining({
                x: 10,
                y: 425,
                size: 62.5,
                opacity: 0.001,
            }),
        );
    });

    it('warns and falls back when image-space overlays lack source dimensions', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await exportCanvasRangeAsPdf({
            canvases: [
                createCanvasWithImage('canvas-1', {
                    width: 2000,
                    height: 1000,
                }),
            ],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            ocrPlacementMode: 'word-anchor',
            ocrSizingMode: 'height-only',
            getCanvasOcrOverlays: () => [
                {
                    text: 'fallback text',
                    x: 10,
                    y: 20,
                    width: 300,
                    height: 40,
                    coordinateSpace: 'image',
                },
            ],
            loadImageBlob: () => createImageBlob(),
        });

        expect(warnSpy).toHaveBeenCalledWith(
            '[PDF export] Missing source image dimensions for image-space OCR overlay; using legacy canvas-space placement',
            expect.objectContaining({ canvasId: 'canvas-1' }),
        );
        expect(getLastDrawTextOptions(mockPdfDoc.page)).toEqual(
            expect.objectContaining({
                x: 5,
                y: 470,
                size: 25,
                opacity: 0.001,
            }),
        );
    });

    it('preserves the default fit-box OCR placement behavior', async () => {
        await exportCanvasRangeAsPdf({
            canvases: [createCanvas('canvas-1')],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            getCanvasOcrOverlays: () => [
                {
                    text: 'significantly longer text',
                    x: 10,
                    y: 20,
                    width: 300,
                    height: 40,
                },
            ],
            loadImageBlob: () => createImageBlob(),
        });

        expect(getLastDrawTextOptions(mockPdfDoc.page)).toEqual(
            expect.objectContaining({
                x: 10,
                y: 448.96,
                size: 27.599999999999998,
                opacity: 0.001,
            }),
        );
    });

    it('supports word-anchor placement with height-only sizing', async () => {
        await exportCanvasRangeAsPdf({
            canvases: [createCanvas('canvas-1')],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            ocrPlacementMode: 'word-anchor',
            ocrSizingMode: 'height-only',
            getCanvasOcrOverlays: () => [
                {
                    text: 'significantly longer text',
                    x: 10,
                    y: 20,
                    width: 300,
                    height: 40,
                },
            ],
            loadImageBlob: () => createImageBlob(),
        });

        expect(getLastDrawTextOptions(mockPdfDoc.page)).toEqual(
            expect.objectContaining({
                x: 10,
                y: 440,
                size: 50,
                opacity: 0.001,
            }),
        );
    });

    it('draws OCR text visibly in debug mode', async () => {
        await exportCanvasRangeAsPdf({
            canvases: [createCanvas('canvas-1')],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            ocrVisibilityMode: 'debug',
            getCanvasOcrOverlays: () => [
                {
                    text: 'debug text',
                    x: 10,
                    y: 20,
                    width: 300,
                    height: 40,
                },
            ],
            loadImageBlob: () => createImageBlob(),
        });

        expect(getLastDrawTextOptions(mockPdfDoc.page)).toEqual(
            expect.objectContaining({
                opacity: 1,
                color: { type: 'rgb', r: 1, g: 0, b: 0 },
            }),
        );
    });

    it('uses invisible text rendering mode when requested', async () => {
        await exportCanvasRangeAsPdf({
            canvases: [createCanvas('canvas-1')],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            ocrVisibilityMode: 'invisible',
            getCanvasOcrOverlays: () => [
                {
                    text: 'hidden text',
                    x: 10,
                    y: 20,
                    width: 300,
                    height: 40,
                },
            ],
            loadImageBlob: () => createImageBlob(),
        });

        expect(mockPdfDoc.page.pushOperators).toHaveBeenCalledWith(
            expect.objectContaining({ op: 'pushGraphicsState' }),
            expect.objectContaining({
                op: 'setTextRenderingMode',
                mode: TextRenderingMode.Invisible,
            }),
        );
        expect(mockPdfDoc.page.pushOperators).toHaveBeenLastCalledWith(
            expect.objectContaining({ op: 'popGraphicsState' }),
        );
        expect(getLastDrawTextOptions(mockPdfDoc.page)).toEqual(
            expect.objectContaining({
                x: 10,
                y: 440,
                size: 50,
            }),
        );
        expect(
            getLastDrawTextOptions(mockPdfDoc.page)?.opacity,
        ).toBeUndefined();
    });

    it('requests spread canvases by height to preserve more raster detail', async () => {
        const loadImageBlob = vi.fn(() => createImageBlob());

        await exportCanvasRangeAsPdf({
            canvases: [
                createIiifCanvas('spread-canvas', {
                    width: 3000,
                    height: 1500,
                }),
            ],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1800,
            manifestId: 'https://example.org/manifest',
            loadImageBlob,
        });

        expect(loadImageBlob).toHaveBeenCalledWith(
            expect.objectContaining({
                imageUrl:
                    'https://example.org/iiif/spread-canvas/full/,1500/0/default.jpg',
            }),
        );
    });

    it('keeps portrait IIIF canvas requests width-constrained', async () => {
        const loadImageBlob = vi.fn(() => createImageBlob());

        await exportCanvasRangeAsPdf({
            canvases: [
                createIiifCanvas('portrait-canvas', {
                    width: 1200,
                    height: 3000,
                }),
            ],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1800,
            manifestId: 'https://example.org/manifest',
            loadImageBlob,
        });

        expect(loadImageBlob).toHaveBeenCalledWith(
            expect.objectContaining({
                imageUrl:
                    'https://example.org/iiif/portrait-canvas/full/1200,/0/default.jpg',
            }),
        );
    });

    it('preserves manifest-based OCR when no provider is configured', async () => {
        const getCanvasAnnotations = vi.fn(() => [
            createOcrAnnotation('manifest text'),
        ]);

        await exportCanvasRangeAsPdf({
            canvases: [createCanvas('canvas-1')],
            startIndex: 0,
            endIndex: 0,
            targetWidth: 1000,
            manifestId: 'https://example.org/manifest',
            getCanvasAnnotations,
            loadImageBlob: () => createImageBlob(),
        });

        expect(getCanvasAnnotations).toHaveBeenCalledWith('canvas-1');
        expect(getDrawnTexts(mockPdfDoc.page)).toContain('manifest text');
    });
});

describe('normalizeCanvasRange', () => {
    it('sorts reversed inputs and returns all indices in range', () => {
        expect(normalizeCanvasRange(4, 1, 6)).toEqual({
            startIndex: 1,
            endIndex: 4,
            indices: [1, 2, 3, 4],
        });
    });

    it('clamps out-of-bounds values', () => {
        expect(normalizeCanvasRange(-5, 9, 3)).toEqual({
            startIndex: 0,
            endIndex: 2,
            indices: [0, 1, 2],
        });
    });

    it('returns null when there are no canvases', () => {
        expect(normalizeCanvasRange(0, 0, 0)).toBeNull();
    });
});

describe('buildPdfFilename', () => {
    it('uses the manifest URL tail and selected range', () => {
        expect(
            buildPdfFilename({
                manifestId: 'https://example.org/iiif/book-1/manifest.json',
                startIndex: 2,
                endIndex: 5,
            }),
        ).toBe('manifest-json-3-6.pdf');
    });

    it('prefers manifestLabel over manifestId when provided', () => {
        expect(
            buildPdfFilename({
                manifestId: 'https://example.org/iiif/book-1/manifest.json',
                manifestLabel: 'The Great Book of Examples',
                startIndex: 0,
                endIndex: 3,
            }),
        ).toBe('The-Great-Book-of-Examples-1-4.pdf');
    });

    it('falls back to manifestId when manifestLabel is null', () => {
        expect(
            buildPdfFilename({
                manifestId: 'https://example.org/iiif/book-1/manifest.json',
                manifestLabel: null,
                startIndex: 0,
                endIndex: 0,
            }),
        ).toBe('manifest-json-1-1.pdf');
    });

    it('falls back to manifestId when manifestLabel is empty', () => {
        expect(
            buildPdfFilename({
                manifestId: 'https://example.org/iiif/book-1/manifest.json',
                manifestLabel: '',
                startIndex: 0,
                endIndex: 0,
            }),
        ).toBe('manifest-json-1-1.pdf');
    });

    it('sanitizes special characters in manifestLabel', () => {
        expect(
            buildPdfFilename({
                manifestId: 'https://example.org/manifest.json',
                manifestLabel: 'Böök: A Title! (Vol. 3)',
                startIndex: 0,
                endIndex: 1,
            }),
        ).toBe('B-k-A-Title-Vol-3-1-2.pdf');
    });
});

describe('buildCoverSheetFields', () => {
    it('appends created timestamp and source URL after consumer fields', () => {
        expect(
            buildCoverSheetFields(
                {
                    title: 'Summary',
                    fields: [
                        { label: 'Repository', value: 'triiiceratops' },
                        { label: 'Collection', value: 'Example collection' },
                    ],
                },
                {
                    createdAt: new Date('2026-04-01T12:00:00Z'),
                    currentUrl: 'https://example.org/viewer?manifest=1',
                },
            ),
        ).toEqual([
            { label: 'Repository', value: 'triiiceratops' },
            { label: 'Collection', value: 'Example collection' },
            { label: 'Created', value: expect.any(String) },
            {
                label: 'Source URL',
                value: 'https://example.org/viewer?manifest=1',
            },
        ]);
    });

    it('omits source URL when not available', () => {
        expect(
            buildCoverSheetFields(
                {
                    fields: [{ label: 'Repository', value: 'triiiceratops' }],
                },
                {
                    createdAt: new Date('2026-04-01T12:00:00Z'),
                    currentUrl: null,
                },
            ),
        ).toEqual([
            { label: 'Repository', value: 'triiiceratops' },
            { label: 'Created', value: expect.any(String) },
        ]);
    });

    it('supports a single field object at runtime', () => {
        expect(
            buildCoverSheetFields(
                {
                    fields: {
                        label: 'Repository',
                        value: 'triiiceratops',
                    },
                } as any,
                {
                    createdAt: new Date('2026-04-01T12:00:00Z'),
                    currentUrl: null,
                },
            ),
        ).toEqual([
            { label: 'Repository', value: 'triiiceratops' },
            { label: 'Created', value: expect.any(String) },
        ]);
    });

    it('supports tuple entries at runtime', () => {
        expect(
            buildCoverSheetFields(
                {
                    fields: [['Repository', 'triiiceratops']],
                } as any,
                {
                    createdAt: new Date('2026-04-01T12:00:00Z'),
                    currentUrl: null,
                },
            ),
        ).toEqual([
            { label: 'Repository', value: 'triiiceratops' },
            { label: 'Created', value: expect.any(String) },
        ]);
    });

    it('supports object maps at runtime', () => {
        expect(
            buildCoverSheetFields(
                {
                    fields: {
                        Repository: 'triiiceratops',
                        Collection: 'Example collection',
                    },
                } as any,
                {
                    createdAt: new Date('2026-04-01T12:00:00Z'),
                    currentUrl: null,
                },
            ),
        ).toEqual([
            { label: 'Repository', value: 'triiiceratops' },
            { label: 'Collection', value: 'Example collection' },
            { label: 'Created', value: expect.any(String) },
        ]);
    });

    it('falls back to runtime fields when fields is missing', () => {
        expect(
            buildCoverSheetFields({} as any, {
                createdAt: new Date('2026-04-01T12:00:00Z'),
                currentUrl: null,
            }),
        ).toEqual([{ label: 'Created', value: expect.any(String) }]);
    });

    it('ignores unsupported field values at runtime', () => {
        expect(
            buildCoverSheetFields(
                {
                    fields: 'not-valid',
                } as any,
                {
                    createdAt: new Date('2026-04-01T12:00:00Z'),
                    currentUrl: null,
                },
            ),
        ).toEqual([{ label: 'Created', value: expect.any(String) }]);
    });
});

describe('buildImageRequestInit', () => {
    it('defaults image fetches to same-origin credentials', () => {
        expect(buildImageRequestInit()).toEqual({
            credentials: 'same-origin',
        });
    });

    it('allows consumers to opt into authenticated image requests', () => {
        expect(
            buildImageRequestInit({
                credentials: 'include',
                mode: 'cors',
            }),
        ).toEqual({
            credentials: 'include',
            mode: 'cors',
        });
    });
});

describe('extractOcrTextOverlays', () => {
    it('extracts supplementing text bodies with xywh targets', () => {
        expect(
            extractOcrTextOverlays([
                {
                    id: 'ocr-1',
                    motivation: 'supplementing',
                    body: {
                        type: 'TextualBody',
                        value: 'Selectable OCR line',
                        format: 'text/plain',
                    },
                    target: 'https://example.org/canvas/1#xywh=10,20,300,40',
                },
            ]),
        ).toEqual([
            {
                text: 'Selectable OCR line',
                x: 10,
                y: 20,
                width: 300,
                height: 40,
                coordinateSpace: 'image',
            },
        ]);
    });

    it('supports target selectors and ignores non-supplementing annotations', () => {
        expect(
            extractOcrTextOverlays([
                {
                    id: 'ocr-2',
                    body: {
                        type: 'TextualBody',
                        value: 'Word level OCR',
                        purpose: 'supplementing',
                    },
                    target: {
                        source: 'https://example.org/canvas/1',
                        selector: {
                            type: 'FragmentSelector',
                            value: 'xywh=50,60,70,20',
                        },
                    },
                },
                {
                    id: 'comment-1',
                    motivation: 'commenting',
                    body: {
                        type: 'TextualBody',
                        value: 'Human comment',
                    },
                    target: 'https://example.org/canvas/1#xywh=1,2,3,4',
                },
            ]),
        ).toEqual([
            {
                text: 'Word level OCR',
                x: 50,
                y: 60,
                width: 70,
                height: 20,
                coordinateSpace: 'image',
            },
        ]);
    });

    it('supports legacy IIIF v2 text annotations using sc:painting', () => {
        expect(
            extractOcrTextOverlays([
                {
                    '@id': 'https://example.org/canvas/1/supplementing/t0',
                    motivation: 'sc:painting',
                    resource: {
                        '@type': 'cnt:ContentAsText',
                        format: 'text/plain',
                        chars: 'Legacy OCR line',
                    },
                    on: 'https://example.org/canvas/1#xywh=120,240,640,38',
                },
            ]),
        ).toEqual([
            {
                text: 'Legacy OCR line',
                x: 120,
                y: 240,
                width: 640,
                height: 38,
                coordinateSpace: 'image',
            },
        ]);
    });
});
