import { describe, expect, it } from 'vitest';

import {
    buildCoverSheetFields,
    buildImageRequestInit,
    buildPdfFilename,
    extractOcrTextOverlays,
    normalizeCanvasRange,
} from './exportPdf';

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
            },
        ]);
    });
});
