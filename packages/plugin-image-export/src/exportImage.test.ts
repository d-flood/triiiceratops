import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The shared canvas/export toolkit these helpers build on lives in core and is
// consumed through its public `triiiceratops/image-export` seam. Mock only the
// two side-effecting primitives (canvas compositing + network fetch); every
// other helper (URL resolution, size ladders, canvas resolution) runs for real.
vi.mock('triiiceratops/image-export', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('triiiceratops/image-export')>();
    return {
        ...actual,
        composeImages: vi.fn(
            async () => new Blob(['composed'], { type: 'image/png' }),
        ),
        fetchImageBlob: vi.fn(
            async (url: string) => new Blob([url], { type: 'image/jpeg' }),
        ),
    };
});

import { composeImages, fetchImageBlob } from 'triiiceratops/image-export';
import { resolveCanvasImage } from 'triiiceratops/image-export';
import {
    buildImageDownloadFilename,
    exportCompositeCanvas,
    exportCurrentWorld,
    exportSingleImage,
    getVisibleCanvasesForDownload,
    resolveCompositeCanvasSizeOptions,
    resolveWorldSizeOptions,
} from './exportImage';

/**
 * Wrap painting annotations in an `AnnotationPage`, the way a IIIF v3 canvas
 * carries them.
 *
 * These canvases used to be `manifesto.js`-shaped doubles — a `getContent()`
 * accessor over annotations with a `getBody()` accessor. Core's v3
 * painting-annotation enumeration is first-party as of the `remove-manifesto`
 * epic (ticket 03) and reads `canvas.items[].items[]`, so they now carry the
 * JSON the accessors used to wrap.
 */
function annotationPages(...annotations: unknown[]) {
    return [
        {
            id: 'https://example.org/annotation-page/1',
            type: 'AnnotationPage',
            items: annotations,
        },
    ];
}

function createCompositeCanvas() {
    return {
        id: 'canvas-1',
        width: 800,
        height: 1000,
        items: annotationPages(
            {
                target: 'https://example.org/canvas/1#xywh=0,0,400,1000',
                body: {
                    id: 'https://example.org/image/1a',
                    width: 400,
                    height: 1000,
                    service: {
                        id: 'https://example.org/iiif/image1a',
                        type: 'ImageService2',
                        profile: 'http://iiif.io/api/image/2/level1.json',
                    },
                },
            },
            {
                target: 'https://example.org/canvas/1#xywh=400,0,400,1000',
                body: {
                    id: 'https://example.org/image/1b',
                    width: 400,
                    height: 1000,
                    service: {
                        id: 'https://example.org/iiif/image1b',
                        type: 'ImageService2',
                        profile: 'http://iiif.io/api/image/2/level1.json',
                    },
                },
            },
        ),
    };
}

function createSingleImageCanvas(id: string) {
    return {
        id,
        width: 1000,
        height: 1200,
        items: annotationPages({
            body: {
                id: `https://example.org/image/${id}.jpg`,
                width: 1000,
                height: 1200,
                service: {
                    id: `https://example.org/iiif/${id}`,
                    type: 'ImageService2',
                    profile: 'http://iiif.io/api/image/2/level1.json',
                },
            },
        }),
    };
}

/**
 * A canvas declaring a 1000x1000 box painted by a 1000x2000 image — manifest
 * Canvas dimensions and image-service dimensions disagreeing, which is the
 * case that separates canvas geometry from image geometry.
 */
function createMismatchedCanvas() {
    return {
        id: 'mismatched',
        width: 1000,
        height: 1000,
        items: annotationPages({
            body: {
                id: 'https://example.org/image/mismatched.jpg',
                width: 1000,
                height: 2000,
                service: {
                    id: 'https://example.org/iiif/mismatched',
                    type: 'ImageService2',
                    profile: 'http://iiif.io/api/image/2/level1.json',
                },
            },
        }),
    };
}

function createViewerState(overrides: Record<string, unknown> = {}) {
    return {
        canvases: [],
        canvasId: null,
        currentCanvasIndex: -1,
        viewingMode: 'individuals',
        viewingDirection: 'left-to-right',
        pagedOffset: 1,
        preserveCanvasScale: false,
        getSelectedChoice: () => undefined,
        ...overrides,
    } as any;
}

beforeEach(() => {
    vi.mocked(composeImages).mockClear();
    vi.mocked(fetchImageBlob).mockClear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('resolveCompositeCanvasSizeOptions', () => {
    it('builds a relative ladder from the canvas own dimensions', () => {
        const options = resolveCompositeCanvasSizeOptions(
            createCompositeCanvas(),
        );
        expect(
            options.map((option) => ({ w: option.width, h: option.height })),
        ).toEqual([
            { w: 800, h: 1000 },
            { w: 400, h: 500 },
            { w: 200, h: 250 },
        ]);
    });

    it('returns nothing for a canvas with no resolvable images', () => {
        const options = resolveCompositeCanvasSizeOptions({
            id: 'empty',
            width: 100,
            height: 100,
            items: [],
        });
        expect(options).toEqual([]);
    });
});

describe('exportSingleImage', () => {
    it('fetches the chosen resolution option URL', async () => {
        const resolved = resolveCanvasImage(createSingleImageCanvas('a'))!;
        await exportSingleImage(resolved, {
            width: 500,
            height: 600,
            label: '50%',
            url: 'https://example.org/chosen.jpg',
        });
        expect(fetchImageBlob).toHaveBeenCalledWith(
            'https://example.org/chosen.jpg',
        );
    });

    it('derives a URL from width/height when the option has none', async () => {
        const resolved = resolveCanvasImage(createSingleImageCanvas('a'))!;
        await exportSingleImage(resolved, {
            width: 500,
            height: 600,
            label: '50%',
        });
        expect(fetchImageBlob).toHaveBeenCalledWith(
            'https://example.org/iiif/a/full/500,/0/default.jpg',
        );
    });
});

describe('exportCompositeCanvas', () => {
    it('composites every image on the canvas at their annotated positions', async () => {
        await exportCompositeCanvas(createCompositeCanvas(), {
            width: 800,
            height: 1000,
            label: 'Original',
        });

        expect(fetchImageBlob).toHaveBeenCalledTimes(2);
        expect(fetchImageBlob).toHaveBeenCalledWith(
            expect.stringContaining('image1a'),
        );
        expect(fetchImageBlob).toHaveBeenCalledWith(
            expect.stringContaining('image1b'),
        );

        expect(composeImages).toHaveBeenCalledTimes(1);
        const [entries, pageWidth, pageHeight] =
            vi.mocked(composeImages).mock.calls[0]!;
        expect(pageWidth).toBe(800);
        expect(pageHeight).toBe(1000);
        expect(entries).toEqual([
            expect.objectContaining({ x: 0, y: 0, width: 400, height: 1000 }),
            expect.objectContaining({
                x: 400,
                y: 0,
                width: 400,
                height: 1000,
            }),
        ]);
    });

    it('throws when the canvas has no exportable images', async () => {
        await expect(
            exportCompositeCanvas(
                { id: 'empty', width: 100, height: 100, items: [] },
                { width: 100, height: 100, label: 'Original' },
            ),
        ).rejects.toThrow('No exportable image found for this canvas.');
    });
});

describe('current world (paged mode)', () => {
    it('resolveWorldSizeOptions lays out two paged canvases side by side', () => {
        const canvasA = createSingleImageCanvas('left');
        const canvasB = createSingleImageCanvas('right');
        const viewerState = createViewerState({
            canvases: [canvasA, canvasB],
            canvasId: 'left',
            currentCanvasIndex: 0,
            viewingMode: 'paged',
            // Pair from the very first canvas instead of treating canvas 0
            // as a lone cover page (ViewerState's real default is 1).
            pagedOffset: 0,
        });

        const options = resolveWorldSizeOptions(viewerState);
        expect(options.length).toBeGreaterThan(0);
        // Two square-ish 1000x1200 canvases side by side should be roughly
        // twice as wide as either one alone.
        const original = options[0]!;
        expect(original.width).toBeGreaterThan(1900);
        expect(original.width).toBeLessThan(2100);
    });

    it('exportCurrentWorld composites both visible canvases positioned side by side', async () => {
        const canvasA = createSingleImageCanvas('left');
        const canvasB = createSingleImageCanvas('right');
        const viewerState = createViewerState({
            canvases: [canvasA, canvasB],
            canvasId: 'left',
            currentCanvasIndex: 0,
            viewingMode: 'paged',
            // Pair from the very first canvas instead of treating canvas 0
            // as a lone cover page (ViewerState's real default is 1).
            pagedOffset: 0,
        });

        await exportCurrentWorld(viewerState, {
            width: 2000,
            height: 1200,
            label: 'Original',
        });

        expect(fetchImageBlob).toHaveBeenCalledTimes(2);
        expect(fetchImageBlob).toHaveBeenCalledWith(
            expect.stringContaining('/iiif/left/'),
        );
        expect(fetchImageBlob).toHaveBeenCalledWith(
            expect.stringContaining('/iiif/right/'),
        );

        expect(composeImages).toHaveBeenCalledTimes(1);
        const [entries] = vi.mocked(composeImages).mock.calls[0]!;
        expect(entries).toHaveLength(2);
        // Second canvas is offset to the right of the first, not overlapping.
        const [first, second] = entries as any[];
        expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
    });

    it('keeps a composite canvas at its full manifest height', () => {
        // Two half-width images side by side on an 800x1000 canvas. Each is
        // laid out from its own half-width box, so the two together span the
        // whole canvas and the world ladder comes out at the canvas's own 0.8
        // aspect ratio rather than a single member image's 0.4. This is a
        // regression pin on the multi-image-per-canvas case surviving the move
        // to the shared layout function; the arithmetic is unchanged from
        // before it.
        const viewerState = createViewerState({
            canvases: [createCompositeCanvas()],
            canvasId: 'canvas-1',
            currentCanvasIndex: 0,
            viewingMode: 'individuals',
        });

        const original = resolveWorldSizeOptions(viewerState)[0]!;
        expect(original.width / original.height).toBeCloseTo(800 / 1000, 5);
    });

    it('lays out from the manifest canvas box when the image disagrees', () => {
        // The manifest's dimensions are the geometry, so the world is square
        // even though the image painting it is 1:2.
        const viewerState = createViewerState({
            canvases: [createMismatchedCanvas()],
            canvasId: 'mismatched',
            currentCanvasIndex: 0,
            viewingMode: 'individuals',
        });

        const original = resolveWorldSizeOptions(viewerState)[0]!;
        expect(original.width / original.height).toBeCloseTo(1, 5);
    });

    it('draws a mismatched image inside the world it sized, not past it', async () => {
        // The size ladder and the composed entries must be derived from the
        // same box. Sizing the world from the manifest Canvas while drawing
        // each image at its *image-service* aspect makes the image overflow
        // the page and composeImages silently clips the overflow away — here
        // that would be a 1000x2000 draw onto a 1000x1000 page.
        const viewerState = createViewerState({
            canvases: [createMismatchedCanvas()],
            canvasId: 'mismatched',
            currentCanvasIndex: 0,
            viewingMode: 'individuals',
        });

        const original = resolveWorldSizeOptions(viewerState)[0]!;
        await exportCurrentWorld(viewerState, original);

        const [entries, pageWidth, pageHeight] =
            vi.mocked(composeImages).mock.calls[0]!;
        expect(entries).toHaveLength(1);
        const [only] = entries as any[];
        expect(only.x + only.width).toBeLessThanOrEqual(pageWidth);
        expect(only.y + only.height).toBeLessThanOrEqual(pageHeight);
        // And it fills the square box rather than being letterboxed inside it.
        expect(only.width / only.height).toBeCloseTo(1, 5);
    });

    it('throws when nothing is visible in the viewer', async () => {
        const viewerState = createViewerState();
        await expect(
            exportCurrentWorld(viewerState, {
                width: 100,
                height: 100,
                label: 'Original',
            }),
        ).rejects.toThrow('Nothing is currently displayed in the viewer.');
    });
});

describe('getVisibleCanvasesForDownload', () => {
    it('returns both canvases of a paged spread, for the single-image canvas picker', () => {
        const canvasA = createSingleImageCanvas('left');
        const canvasB = createSingleImageCanvas('right');
        const viewerState = createViewerState({
            canvases: [canvasA, canvasB],
            canvasId: 'left',
            currentCanvasIndex: 0,
            viewingMode: 'paged',
            pagedOffset: 0,
        });

        expect(getVisibleCanvasesForDownload(viewerState)).toEqual([
            canvasA,
            canvasB,
        ]);
    });

    it('returns only the active canvas in individuals mode', () => {
        const canvasA = createSingleImageCanvas('left');
        const canvasB = createSingleImageCanvas('right');
        const viewerState = createViewerState({
            canvases: [canvasA, canvasB],
            canvasId: 'left',
            currentCanvasIndex: 0,
            viewingMode: 'individuals',
        });

        expect(getVisibleCanvasesForDownload(viewerState)).toEqual([canvasA]);
    });
});

describe('buildImageDownloadFilename', () => {
    it('sanitizes the label and appends a mode suffix and extension', () => {
        expect(
            buildImageDownloadFilename(
                'My Canvas #1',
                'composite',
                'image/png',
            ),
        ).toBe('My-Canvas-1-composite.png');
    });

    it('omits the suffix for single-image mode and respects jpeg format', () => {
        expect(
            buildImageDownloadFilename('Front Cover', 'single', 'image/jpeg'),
        ).toBe('Front-Cover.jpg');
    });

    it('falls back to a generic name for an unlabeled canvas', () => {
        expect(buildImageDownloadFilename('', 'world', 'image/png')).toBe(
            'image-world.png',
        );
    });
});
