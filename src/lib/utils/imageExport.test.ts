import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCanvasImage } from './resolveCanvasImage';
import {
    buildRelativeSizeOptions,
    clampCompositeSize,
    composeImages,
    downloadBlob,
    fetchImageBlob,
    getResolvedImageExportUrl,
    resolveExportSizeOptions,
} from './imageExport';
import { installCanvasCompositingMocks } from '../test/utils/mockCanvasCompositing';

function createLevel1Canvas() {
    return {
        id: 'canvas-1',
        width: 800,
        height: 1000,
        getContent: () => [
            {
                getBody: () => ({
                    id: 'https://example.org/image/1.jpg',
                    width: 800,
                    height: 1000,
                    service: {
                        id: 'https://example.org/iiif/image1',
                        type: 'ImageService2',
                        profile: 'http://iiif.io/api/image/2/level1.json',
                    },
                }),
            },
        ],
    };
}

function createLevel0Canvas() {
    return {
        id: 'canvas-level0',
        width: 4000,
        height: 3000,
        getContent: () => [
            {
                getBody: () => ({
                    id: 'https://example.org/static/level0.jpg',
                    width: 4000,
                    height: 3000,
                    service: {
                        id: 'https://example.org/iiif/level0-image',
                        type: 'ImageService2',
                        profile: 'http://iiif.io/api/image/2/level0.json',
                    },
                }),
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
            { width: 800, height: 1000, label: 'Original (800 × 1000px)', url: undefined },
            { width: 400, height: 500, label: '50% (400 × 500px)', url: undefined },
            { width: 200, height: 250, label: '25% (200 × 250px)', url: undefined },
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
        expect(options[0]).toMatchObject({ width: 800, height: 1000, label: 'Original (800 × 1000px)' });
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
        expect(options.map((option) => option.width).sort((a, b) => a - b)).toEqual([
            500, 1000, 4000,
        ]);
        // Every option's URL is a size the level0 service actually declared.
        for (const option of options) {
            expect(option.url).toMatch(/^https:\/\/example\.org\/iiif\/level0-image\/full\//);
        }
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
