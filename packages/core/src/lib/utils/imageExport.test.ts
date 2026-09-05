import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCanvasImage } from './resolveCanvasImage';
import {
    buildRelativeSizeOptions,
    clampCompositeSize,
    composeImages,
    downloadBlob,
    fetchExportImageBlob,
    fetchImageBlob,
    getResolvedImageExportUrl,
    isCrossOriginImageFailure,
    resolveExportSizeOptions,
    sanitizeFilenamePart,
} from './imageExport';
import { installCanvasCompositingMocks } from '../test/utils/mockCanvasCompositing';

function createLevel1Canvas() {
    return {
        id: 'canvas-1',
        width: 800,
        height: 1000,
        items: [
            {
                id: 'https://example.org/annotation-page/1',
                type: 'AnnotationPage',
                items: [
                    {
                        body: {
                            id: 'https://example.org/image/1.jpg',
                            width: 800,
                            height: 1000,
                            service: {
                                id: 'https://example.org/iiif/image1',
                                type: 'ImageService2',
                                profile:
                                    'http://iiif.io/api/image/2/level1.json',
                            },
                        },
                    },
                ],
            },
        ],
    };
}

function createLevel0Canvas() {
    return {
        id: 'canvas-level0',
        width: 4000,
        height: 3000,
        items: [
            {
                id: 'https://example.org/annotation-page/level0',
                type: 'AnnotationPage',
                items: [
                    {
                        body: {
                            id: 'https://example.org/static/level0.jpg',
                            width: 4000,
                            height: 3000,
                            service: {
                                id: 'https://example.org/iiif/level0-image',
                                type: 'ImageService2',
                                profile:
                                    'http://iiif.io/api/image/2/level0.json',
                            },
                        },
                    },
                ],
            },
        ],
    };
}

describe('composeImages', () => {
    let mocks: ReturnType<typeof installCanvasCompositingMocks>;

    beforeEach(() => {
        mocks = installCanvasCompositingMocks();
    });

    afterEach(() => {
        mocks.restore();
    });

    it('draws every entry at its given rect and returns a blob of the requested type', async () => {
        const blob = await composeImages(
            [
                {
                    blob: new Blob(['a']),
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 200,
                },
                {
                    blob: new Blob(['b']),
                    x: 100,
                    y: 0,
                    width: 50,
                    height: 200,
                },
            ],
            150,
            200,
            'image/jpeg',
        );

        expect(mocks.drawImage).toHaveBeenCalledTimes(2);
        expect(mocks.drawImage).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            0,
            0,
            100,
            200,
        );
        expect(mocks.drawImage).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            100,
            0,
            50,
            200,
        );
        expect(blob.type).toBe('image/jpeg');
    });
});

describe('isCrossOriginImageFailure', () => {
    it('recognises each engine"s fetch wording', () => {
        for (const message of [
            'Failed to fetch',
            'NetworkError when attempting to fetch resource.',
            'Load failed',
            'cross-origin request blocked',
            'CORS policy',
        ]) {
            expect(isCrossOriginImageFailure(new TypeError(message))).toBe(
                true,
            );
        }
    });

    it('recognises the canvas taint a blocked read produces', () => {
        // The case a plugin-local copy of this rule missed, reporting a taint
        // as a generic failure with no proxy hint.
        expect(
            isCrossOriginImageFailure(
                new DOMException('Tainted canvas', 'SecurityError'),
            ),
        ).toBe(true);
    });

    it('does not swallow ordinary programming mistakes', () => {
        expect(
            isCrossOriginImageFailure(new TypeError('x is not a function')),
        ).toBe(false);
        expect(isCrossOriginImageFailure(new Error('Failed to fetch'))).toBe(
            false,
        );
        expect(isCrossOriginImageFailure(undefined)).toBe(false);
    });
});

describe('sanitizeFilenamePart', () => {
    it('reduces a label to filesystem-safe segments', () => {
        expect(sanitizeFilenamePart('Codex Sinaiticus, f. 12r')).toBe(
            'Codex-Sinaiticus-f-12r',
        );
        expect(sanitizeFilenamePart('--a--b--')).toBe('a-b');
        expect(sanitizeFilenamePart('///')).toBe('');
    });
});

describe('clampCompositeSize', () => {
    it('leaves small sizes untouched', () => {
        expect(clampCompositeSize(1000, 800)).toEqual({
            width: 1000,
            height: 800,
            clamped: false,
        });
    });

    it('scales down a size that exceeds the max dimension', () => {
        const result = clampCompositeSize(20000, 1000);
        expect(result.clamped).toBe(true);
        expect(result.width).toBeLessThanOrEqual(8000);
        expect(result.height).toBeLessThan(1000);
        // aspect ratio preserved
        expect(result.width / result.height).toBeCloseTo(20, 1);
    });

    it('scales down a size that exceeds the max area even under the per-side cap', () => {
        const result = clampCompositeSize(7000, 7000);
        expect(result.clamped).toBe(true);
        // Rounding to whole pixels can overshoot the exact cap by a few
        // pixels; assert it stays within a tight tolerance of it instead.
        expect(result.width * result.height).toBeLessThanOrEqual(40_010_000);
        expect(result.width).toBe(result.height);
    });
});

describe('getResolvedImageExportUrl', () => {
    it('builds a sized IIIF request URL for a non-level0 service', () => {
        const resolved = resolveCanvasImage(createLevel1Canvas())!;
        expect(getResolvedImageExportUrl(resolved, { width: 400 })).toBe(
            'https://example.org/iiif/image1/full/400,/0/default.jpg',
        );
    });

    it('requests the max size when no width/height is given', () => {
        const resolved = resolveCanvasImage(createLevel1Canvas())!;
        expect(getResolvedImageExportUrl(resolved)).toBe(
            'https://example.org/iiif/image1/full/max/0/default.jpg',
        );
    });

    it('ignores requested dimensions for level0 services and returns the static resource', () => {
        const resolved = resolveCanvasImage(createLevel0Canvas())!;
        expect(getResolvedImageExportUrl(resolved, { width: 400 })).toBe(
            'https://example.org/static/level0.jpg',
        );
    });
});

describe('buildRelativeSizeOptions', () => {
    it('builds an Original/50%/25% ladder from native dimensions', () => {
        const options = buildRelativeSizeOptions(800, 1000);
        expect(options).toEqual([
            {
                width: 800,
                height: 1000,
                label: 'Original (800 × 1000px)',
                url: undefined,
            },
            {
                width: 400,
                height: 500,
                label: '50% (400 × 500px)',
                url: undefined,
            },
            {
                width: 200,
                height: 250,
                label: '25% (200 × 250px)',
                url: undefined,
            },
        ]);
    });

    it('drops options whose getUrl callback returns nothing', () => {
        const options = buildRelativeSizeOptions(800, 1000, ({ isOriginal }) =>
            isOriginal ? 'https://example.org/original.jpg' : null,
        );
        expect(options).toHaveLength(1);
        expect(options[0].url).toBe('https://example.org/original.jpg');
    });
});

describe('resolveExportSizeOptions', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
        fetchSpy?.mockRestore();
    });

    it('returns a relative preset ladder for a non-level0 service', async () => {
        const resolved = resolveCanvasImage(createLevel1Canvas())!;
        const options = await resolveExportSizeOptions(resolved);

        expect(options).toHaveLength(3);
        expect(options[0]).toMatchObject({
            width: 800,
            height: 1000,
            label: 'Original (800 × 1000px)',
        });
        expect(options[0].url).toBe(
            'https://example.org/iiif/image1/full/max/0/default.jpg',
        );
        expect(options[1]).toMatchObject({ width: 400, height: 500 });
    });

    it('enumerates exact info.json sizes for a level0 service', async () => {
        const infoJson = {
            '@context': 'http://iiif.io/api/image/2/context.json',
            '@id': 'https://example.org/iiif/level0-image',
            profile: ['http://iiif.io/api/image/2/level0.json'],
            width: 4000,
            height: 3000,
            sizes: [
                { width: 500, height: 375 },
                { width: 1000, height: 750 },
                { width: 4000, height: 3000 },
            ],
        };

        fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => infoJson,
        } as Response);

        const resolved = resolveCanvasImage(createLevel0Canvas())!;
        const options = await resolveExportSizeOptions(resolved);

        expect(fetchSpy).toHaveBeenCalledWith(
            'https://example.org/iiif/level0-image/info.json',
        );
        expect(
            options.map((option) => option.width).sort((a, b) => a - b),
        ).toEqual([500, 1000, 4000]);
        // Every option's URL is a size the level0 service actually declared.
        for (const option of options) {
            expect(option.url).toMatch(
                /^https:\/\/example\.org\/iiif\/level0-image\/full\//,
            );
        }
    });

    it('offers exactly the whole-image URLs the renderer would request for a size-ladder service', async () => {
        // The export ladder and the renderer's size-ladder source are the same
        // model (`renderer/sizeLadder`), which is what stops the two from
        // drifting into offering a size nobody can fetch.
        fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                '@context': 'http://iiif.io/api/image/2/context.json',
                '@id': 'https://example.org/iiif/level0-image',
                profile: ['http://iiif.io/api/image/2/level0.json'],
                width: 4000,
                height: 3000,
                sizes: [
                    { width: 500, height: 375 },
                    { width: 1000, height: 750 },
                    { width: 4000, height: 3000 },
                ],
            }),
        } as Response);

        const resolved = resolveCanvasImage(createLevel0Canvas())!;
        const options = await resolveExportSizeOptions(resolved);

        expect(options).toEqual([
            {
                width: 4000,
                height: 3000,
                label: '4000 × 3000px',
                // Version 2 spells the whole image `full`; version 3 `max`.
                url: 'https://example.org/iiif/level0-image/full/full/0/default.jpg',
            },
            {
                width: 1000,
                height: 750,
                label: '1000 × 750px',
                url: 'https://example.org/iiif/level0-image/full/1000,/0/default.jpg',
            },
            {
                width: 500,
                height: 375,
                label: '500 × 375px',
                url: 'https://example.org/iiif/level0-image/full/500,/0/default.jpg',
            },
        ]);
    });

    it('offers one whole image per advertised scale factor for a level0 service with tiles', async () => {
        // The other level0 shape: a real pyramid. Only the ADVERTISED factors
        // appear — a level0 server holds no derivative for any other — and only
        // the full-size level carries a `url`: level0 compliance guarantees a
        // whole image at the canonical whole-image URL and nothing more, so the
        // intermediate levels are fetched as tiles instead (see
        // `fetchExportImageBlob`).
        fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                '@context': 'http://iiif.io/api/image/3/context.json',
                id: 'https://example.org/iiif/level0-image',
                type: 'ImageService3',
                profile: 'level0',
                width: 4000,
                height: 3000,
                tiles: [{ width: 512, scaleFactors: [1, 4] }],
            }),
        } as Response);

        const resolved = resolveCanvasImage(createLevel0Canvas())!;
        const options = await resolveExportSizeOptions(resolved);

        expect(options).toEqual([
            {
                width: 4000,
                height: 3000,
                label: '4000 × 3000px',
                url: 'https://example.org/iiif/level0-image/full/max/0/default.jpg',
            },
            {
                width: 1000,
                height: 750,
                label: '1000 × 750px',
                url: undefined,
            },
        ]);
    });

    it('falls back to the native resource when info.json is unavailable', async () => {
        fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: false } as Response);

        const resolved = resolveCanvasImage(createLevel0Canvas())!;
        const options = await resolveExportSizeOptions(resolved);

        expect(options).toEqual([
            {
                width: 4000,
                height: 3000,
                label: 'Original',
                url: 'https://example.org/static/level0.jpg',
            },
        ]);
    });
});

describe('fetchExportImageBlob', () => {
    let mocks: ReturnType<typeof installCanvasCompositingMocks>;

    beforeEach(() => {
        mocks = installCanvasCompositingMocks();
    });

    afterEach(() => {
        mocks.restore();
        vi.restoreAllMocks();
    });

    /**
     * Answers `info.json` with `facts` and every image request with a blob,
     * returning the image URLs that were asked for in order.
     */
    function stubService(facts: unknown): string[] {
        const requested: string[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation((async (
            url: string,
        ) => {
            if (url.endsWith('/info.json')) {
                return { ok: true, json: async () => facts } as Response;
            }
            requested.push(url);
            return {
                ok: true,
                blob: async () => new Blob([url], { type: 'image/jpeg' }),
            } as Response;
        }) as unknown as typeof fetch);
        return requested;
    }

    it('requests a carried option URL directly, with no metadata fetch', async () => {
        const requested = stubService({});
        const resolved = resolveCanvasImage(createLevel1Canvas())!;

        await fetchExportImageBlob(resolved, {
            url: 'https://example.org/chosen.jpg',
            width: 500,
        });

        expect(requested).toEqual(['https://example.org/chosen.jpg']);
    });

    it('derives a sized request for a service that answers any size', async () => {
        const requested = stubService({});
        const resolved = resolveCanvasImage(createLevel1Canvas())!;

        await fetchExportImageBlob(resolved, { width: 500, height: 600 });

        expect(requested).toEqual([
            'https://example.org/iiif/image1/full/500,/0/default.jpg',
        ]);
    });

    /**
     * The bug this whole path exists for. A level0 tile tree behind an auth
     * gateway (CSNTM's `collections.csntm.org` is the live example) answers
     * `info.json` at the advertised service id but signs the `id` INSIDE it, and
     * image requests to the unsigned base are 401s. The renderer already reads
     * `requestBaseUri`; before this, export did not, and downloaded from a base
     * that refuses to serve.
     */
    it('requests a level0 tile tree from the base uri info.json declares, not the advertised one', async () => {
        const requested = stubService({
            '@context': 'http://iiif.io/api/image/3/context.json',
            id: 'https://signed.example.org/t/abc123/iiif/level0-image',
            type: 'ImageService3',
            profile: 'level0',
            width: 4000,
            height: 3000,
            tiles: [{ width: 512, scaleFactors: [1, 8] }],
        });
        const resolved = resolveCanvasImage(createLevel0Canvas())!;

        await fetchExportImageBlob(resolved, { width: 4000 });

        expect(requested).toEqual([
            'https://signed.example.org/t/abc123/iiif/level0-image/full/max/0/default.jpg',
        ]);
    });

    it('stitches an intermediate level0 tile level from the tiles the renderer paints', async () => {
        const requested = stubService({
            '@context': 'http://iiif.io/api/image/3/context.json',
            id: 'https://signed.example.org/t/abc123/iiif/level0-image',
            type: 'ImageService3',
            profile: 'level0',
            width: 4000,
            height: 3000,
            // 500×375 is the whole image at scale factor 8, and a static tree
            // holds no `full/500,` derivative for it — only the tile.
            sizes: [{ width: 500, height: 375 }],
            tiles: [{ width: 512, scaleFactors: [1, 8] }],
        });
        const resolved = resolveCanvasImage(createLevel0Canvas())!;

        await fetchExportImageBlob(resolved, { width: 500 });

        // The canonical whole-image spelling: `full` region, explicit `w,h`.
        // `renderer/tilePyramid.tileUrl` owns that decision.
        expect(requested).toEqual([
            'https://signed.example.org/t/abc123/iiif/level0-image/full/500,375/0/default.jpg',
        ]);
        expect(vi.mocked(mocks.drawImage)).toHaveBeenCalledTimes(1);
    });

    it('stitches every tile of a multi-tile level0 level onto one image', async () => {
        const requested = stubService({
            '@context': 'http://iiif.io/api/image/3/context.json',
            id: 'https://signed.example.org/iiif/level0-image',
            type: 'ImageService3',
            profile: 'level0',
            width: 2000,
            height: 1000,
            sizes: [{ width: 1000, height: 500 }],
            tiles: [{ width: 512, scaleFactors: [1, 2] }],
        });
        const resolved = resolveCanvasImage({
            ...createLevel0Canvas(),
            width: 2000,
            height: 1000,
        })!;

        await fetchExportImageBlob(resolved, { width: 1000 });

        // Scale factor 2, 512px tiles: a 1024px span over 2000×1000 source
        // pixels is 2 columns by 1 row, the second column partial.
        expect(requested).toEqual([
            'https://signed.example.org/iiif/level0-image/0,0,1024,1000/512,500/0/default.jpg',
            'https://signed.example.org/iiif/level0-image/1024,0,976,1000/488,500/0/default.jpg',
        ]);
        expect(vi.mocked(mocks.drawImage)).toHaveBeenCalledTimes(2);
    });

    it('serves a size-ladder level0 service from its advertised whole images', async () => {
        const requested = stubService({
            '@context': 'http://iiif.io/api/image/2/context.json',
            '@id': 'https://example.org/iiif/level0-image',
            profile: ['http://iiif.io/api/image/2/level0.json'],
            width: 4000,
            height: 3000,
            sizes: [
                { width: 1000, height: 750 },
                { width: 4000, height: 3000 },
            ],
        });
        const resolved = resolveCanvasImage(createLevel0Canvas())!;

        await fetchExportImageBlob(resolved, { width: 900 });

        // No tiles to stitch, so the advertised whole image is the answer — and
        // the rung chosen is the smallest one at least as wide as asked for.
        expect(requested).toEqual([
            'https://example.org/iiif/level0-image/full/1000,/0/default.jpg',
        ]);
    });

    it('falls back to the published resource when a level0 info.json never arrives', async () => {
        const requested: string[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation((async (
            url: string,
        ) => {
            if (url.endsWith('/info.json')) return { ok: false } as Response;
            requested.push(url);
            return { ok: true, blob: async () => new Blob(['x']) } as Response;
        }) as unknown as typeof fetch);
        const resolved = resolveCanvasImage(createLevel0Canvas())!;

        await fetchExportImageBlob(resolved, { width: 500 });

        expect(requested).toEqual(['https://example.org/static/level0.jpg']);
    });
});

describe('fetchImageBlob', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the response blob on success', async () => {
        const blob = new Blob(['x']);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            blob: async () => blob,
        } as Response);

        await expect(fetchImageBlob('https://example.org/a.jpg')).resolves.toBe(
            blob,
        );
    });

    it('throws when the response is not ok', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: false,
            status: 404,
        } as Response);

        await expect(
            fetchImageBlob('https://example.org/missing.jpg'),
        ).rejects.toThrow('Image request failed with 404.');
    });
});

describe('downloadBlob', () => {
    it('creates and clicks a download anchor, then revokes the object URL', () => {
        const createObjectUrlSpy = vi
            .spyOn(URL, 'createObjectURL')
            .mockReturnValue('blob:mock');
        const revokeObjectUrlSpy = vi
            .spyOn(URL, 'revokeObjectURL')
            .mockImplementation(() => {});
        const clickSpy = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => {});

        downloadBlob(new Blob(['x']), 'canvas.png');

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:mock');

        createObjectUrlSpy.mockRestore();
        revokeObjectUrlSpy.mockRestore();
        clickSpy.mockRestore();
    });
});
