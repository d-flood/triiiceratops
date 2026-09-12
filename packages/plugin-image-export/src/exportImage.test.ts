import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The shared canvas/export toolkit these helpers build on lives in core and is
// consumed through its public `triiiceratops/image-export` seam. Mock only the
// two side-effecting primitives (canvas compositing + image retrieval); every
// other helper (URL resolution, size ladders, canvas resolution) runs for real.
//
// `fetchExportImageBlob` is where retrieval sits, and it is core's job rather
// than a URL these helpers build: for a level0 source the request base comes
// from `info.json` and a resolution may have to be stitched from tiles (core's
// `imageExport.test.ts` owns that). What is asserted here is what this package
// actually decides — WHICH image is fetched at WHICH size, and where each one
// lands on the composited page.
vi.mock('triiiceratops/image-export', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('triiiceratops/image-export')>();
    return {
        ...actual,
        composeImages: vi.fn(
            async () => new Blob(['composed'], { type: 'image/png' }),
        ),
        fetchExportImageBlob: vi.fn(
            async () => new Blob(['image'], { type: 'image/jpeg' }),
        ),
    };
});

import {
    composeImages,
    fetchExportImageBlob,
} from 'triiiceratops/image-export';

import { resolveCanvasImage } from 'triiiceratops/image-export';
import {
    buildImageDownloadFilename,
    exportCompositeCanvas,
    exportCurrentWorld,
    exportSingleImage,
    getCanvasImageChoices,
    getImageHost,
    getVisibleCanvasesForDownload,
    isCrossOriginImageFailure,
    resolveCompositeCanvasSizeOptions,
    resolveWorldSizeOptions,
} from './exportImage';

/** The image each `fetchExportImageBlob` call asked for, and at what width. */
function requestedImages(): Array<{ source: string; width?: number }> {
    return vi
        .mocked(fetchExportImageBlob)
        .mock.calls.map(([resolved, target]) => ({
            source: resolved.serviceId ?? resolved.resourceId ?? '',
            width: target?.width,
        }));
}

/**
 * Wrap painting annotations in an `AnnotationPage`, the way a IIIF v3 canvas
 * carries them.
 *
 * Core's v3 painting-annotation enumeration reads `canvas.items[].items[]`
 * directly, so these canvases carry that raw JSON shape.
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
 * A COMPOSITE of two traits no single vendored fixture carries together, so one
 * canvas exercises both at once. Core gets the **unsupported presentation** for
 * it either way.
 *
 * - A lone `Video` painting body, from `av/0003-mvm-video` — whose canvas has no
 *   `thumbnail` at all.
 * - A poster `thumbnail`, from the opera fixtures (`av/0064-opera-one-canvas`),
 *   whose entry is `{id, type: 'Image'}`. The `format` here is added, not
 *   vendored: a poster frame is the nearest thing to an image such a canvas
 *   offers, and an export that reached for it would be putting an accompanying
 *   image in as a stand-in.
 */
function createVideoCanvas(id: string) {
    return {
        id,
        width: 640,
        height: 360,
        duration: 12,
        thumbnail: [
            {
                id: `https://example.org/poster/${id}.jpg`,
                type: 'Image',
                format: 'image/jpeg',
            },
        ],
        items: annotationPages({
            body: {
                id: `https://example.org/media/${id}.mp4`,
                type: 'Video',
                format: 'video/mp4',
                width: 640,
                height: 360,
                duration: 12,
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
    vi.mocked(fetchExportImageBlob).mockClear();
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
    it('passes the chosen resolution option through whole', async () => {
        const resolved = resolveCanvasImage(createSingleImageCanvas('a'))!;
        const option = {
            width: 500,
            height: 600,
            label: '50%',
            url: 'https://example.org/chosen.jpg',
        };
        await exportSingleImage(resolved, option);
        // Whole, not just its URL: an option for a resolution that has to be
        // stitched from a level0 tile tree carries no URL at all, and only its
        // dimensions say which level to assemble.
        expect(fetchExportImageBlob).toHaveBeenCalledWith(resolved, option);
    });

    it('asks for the option dimensions when it carries no URL', async () => {
        const resolved = resolveCanvasImage(createSingleImageCanvas('a'))!;
        await exportSingleImage(resolved, {
            width: 500,
            height: 600,
            label: '50%',
        });
        expect(requestedImages()).toEqual([
            { source: 'https://example.org/iiif/a', width: 500 },
        ]);
    });
});

describe('exportCompositeCanvas', () => {
    it('composites every image on the canvas at their annotated positions', async () => {
        await exportCompositeCanvas(createCompositeCanvas(), {
            width: 800,
            height: 1000,
            label: 'Original',
        });

        // Each member image is asked for at the width of the box it occupies on
        // the composited page, not at the page width.
        expect(requestedImages()).toEqual([
            { source: 'https://example.org/iiif/image1a', width: 400 },
            { source: 'https://example.org/iiif/image1b', width: 400 },
        ]);

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

        expect(requestedImages().map((request) => request.source)).toEqual([
            'https://example.org/iiif/left',
            'https://example.org/iiif/right',
        ]);

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
        // aspect ratio rather than a single member image's 0.4.
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

/**
 * The **unsupported presentation** edge, as an export sees it: a canvas whose
 * **painting annotations** place nothing core can render contributes nothing to
 * an image export, silently. No error, and no reaching past the missing image
 * for the canvas's poster thumbnail — an accompanying image is not a stand-in
 * for content this export cannot represent.
 *
 * A **canvas claim** does not enter into it. A claim is about what is rendered
 * on screen; whether an export can produce a raster is decided by the canvas's
 * bodies, so the answer is the same claimed or not.
 */
describe('audiovisual canvases', () => {
    it('offers no image to download from an AV canvas', () => {
        // Nothing for the single-image picker to list, and no resolution
        // ladder for the composite mode to offer.
        expect(getCanvasImageChoices(createVideoCanvas('film'))).toEqual([]);
        expect(
            resolveCompositeCanvasSizeOptions(createVideoCanvas('film')),
        ).toEqual([]);
    });

    it('composites only the image canvases of a mixed spread', async () => {
        const viewerState = createViewerState({
            canvases: [
                createSingleImageCanvas('left'),
                createVideoCanvas('film'),
            ],
            canvasId: 'left',
            currentCanvasIndex: 0,
            viewingMode: 'paged',
            pagedOffset: 0,
        });

        const original = resolveWorldSizeOptions(viewerState)[0]!;
        await exportCurrentWorld(viewerState, original);

        // One image fetched, and it is the image canvas's — neither the MP4
        // nor the poster frame was asked for.
        expect(requestedImages().map((request) => request.source)).toEqual([
            'https://example.org/iiif/left',
        ]);
        const [entries] = vi.mocked(composeImages).mock.calls[0]!;
        expect(entries).toHaveLength(1);

        // And the world is the surviving canvas's own shape, so the AV canvas
        // left no empty column behind either.
        expect(original.width / original.height).toBeCloseTo(1000 / 1200, 5);
    });

    it('reports nothing displayable rather than an error entry for an AV-only view', async () => {
        const viewerState = createViewerState({
            canvases: [createVideoCanvas('film')],
            canvasId: 'film',
            currentCanvasIndex: 0,
            viewingMode: 'individuals',
        });

        expect(resolveWorldSizeOptions(viewerState)).toEqual([]);
        await expect(
            exportCurrentWorld(viewerState, {
                width: 640,
                height: 360,
                label: 'Original',
            }),
        ).rejects.toThrow('Nothing is currently displayed in the viewer.');
    });

    it('keeps an AV canvas out of the single-image picker', () => {
        const page = createSingleImageCanvas('left');
        const viewerState = createViewerState({
            canvases: [page, createVideoCanvas('film')],
            canvasId: 'left',
            currentCanvasIndex: 0,
            viewingMode: 'paged',
            pagedOffset: 0,
        });

        // The dropdown is built from this list. Offering the video would let
        // the reader pick it and find an empty resolution ladder and a disabled
        // button behind it — a visible dead end where the contract promises a
        // silent exclusion.
        expect(getVisibleCanvasesForDownload(viewerState)).toEqual([page]);
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

describe('isCrossOriginImageFailure', () => {
    it('recognises the fetch rejection each engine uses for a blocked read', () => {
        // A browser deliberately tells script nothing about a cross-origin
        // refusal, so the wording is all there is — and it differs per engine.
        for (const message of [
            'Failed to fetch', // Chromium
            'NetworkError when attempting to fetch resource.', // Firefox
            'Load failed', // WebKit
        ]) {
            expect(isCrossOriginImageFailure(new TypeError(message))).toBe(
                true,
            );
        }
    });

    it('recognises a canvas refusing to hand back unreadable pixels', () => {
        expect(
            isCrossOriginImageFailure(
                new DOMException(
                    'Tainted canvases may not be exported.',
                    'SecurityError',
                ),
            ),
        ).toBe(true);
    });

    it('does not blame the image server for an ordinary failure', () => {
        // These have fixes, and reporting them as somebody else's policy would
        // send whoever can fix them looking in the wrong place.
        expect(
            isCrossOriginImageFailure(
                new Error('Image request failed with 404.'),
            ),
        ).toBe(false);
        expect(
            isCrossOriginImageFailure(
                new Error('No exportable image found for this canvas.'),
            ),
        ).toBe(false);
        expect(
            isCrossOriginImageFailure(new TypeError('x is not a function')),
        ).toBe(false);
        expect(isCrossOriginImageFailure(undefined)).toBe(false);
    });
});

describe('getImageHost', () => {
    it('names the image service host, so an error can say who declined', () => {
        const resolved = resolveCanvasImage(createSingleImageCanvas('a'))!;
        expect(getImageHost(resolved)).toBe('example.org');
    });

    it('returns null when there is no absolute URL to read a host from', () => {
        expect(
            getImageHost({
                serviceId: null,
                resourceId: 'relative.jpg',
            } as any),
        ).toBeNull();
        expect(
            getImageHost({ serviceId: null, resourceId: null } as any),
        ).toBeNull();
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

    it('leads with the manifest label when there is one', () => {
        expect(
            buildImageDownloadFilename(
                'Folio 2r',
                'single',
                'image/jpeg',
                'Évangiles de Saint-Médard',
            ),
        ).toBe('vangiles-de-Saint-M-dard-Folio-2r.jpg');
    });

    it('uses whichever of the two labels resolved', () => {
        expect(
            buildImageDownloadFilename('Folio 2r', 'single', 'image/png', null),
        ).toBe('Folio-2r.png');
        expect(
            buildImageDownloadFilename('', 'single', 'image/png', 'Codex B'),
        ).toBe('Codex-B.png');
    });
});
