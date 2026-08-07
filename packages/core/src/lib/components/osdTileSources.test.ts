import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTileSources, toLayoutSource } from './osdTileSources';

class FakeIIIFTileSource {
    width: number;
    height: number;
    _id: string;
    version: number;
    tileFormat: string;
    profile: unknown;
    scale_factors: number[];
    minLevel = 0;
    maxLevel = 2;
    __triiiceratopsLevel0LowZoomPrepared?: boolean;

    constructor(options: any) {
        this.width = options.width;
        this.height = options.height;
        this._id = options._id || options.id || options['@id'];
        this.version = options.version ?? 3;
        this.tileFormat = options.tileFormat ?? 'jpg';
        this.profile = options.profile;
        this.scale_factors = options.scale_factors ?? [1, 2, 4];
    }

    configure(data: any, url: string) {
        return {
            ...data,
            _id:
                data._id ||
                data.id ||
                data['@id'] ||
                url.replace('/info.json', ''),
            width: data.width ?? 4000,
            height: data.height ?? 3000,
            version: data.version ?? 3,
            tileFormat: data.tileFormat ?? 'jpg',
        };
    }

    getTileUrl(level: number, x: number, y: number) {
        return `tile/${level}/${x}/${y}`;
    }

    getLevelScale(level: number) {
        return [0.25, 0.5, 1][level] ?? 1;
    }

    getNumTiles(level: number) {
        if (level <= 1) return { x: 1, y: 1 };
        return { x: 2, y: 2 };
    }
}

describe('resolveTileSources', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('passes through non-string sources unchanged', async () => {
        const objectSource = {
            '@context': 'http://iiif.io/api/image/2/context.json',
            profile: 'https://iiif.io/api/image/2/level0.json',
        };

        const result = await resolveTileSources({ sources: [objectSource] });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.resolved[0]).toBe(objectSource);
            expect(result.resolved[0].profile).toBe(
                'https://iiif.io/api/image/2/level0.json',
            );
        }
    });

    it('fetches info.json once and returns parsed source for non-401 responses', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            status: 200,
            ok: true,
            json: async () => ({ width: 1000, height: 800 }),
        } as Response);

        const source = 'https://example.org/iiif/image/info.json';
        const result = await resolveTileSources({ sources: [source] });

        expect(fetchSpy).toHaveBeenCalledWith(source);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.resolved[0]).toEqual({ width: 1000, height: 800 });
        }
    });

    it('returns auth error when any string source responds with 401', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            const isProtected = url.includes('protected');
            return {
                status: isProtected ? 401 : 200,
                ok: !isProtected,
                json: async () => ({ width: 1000, height: 800 }),
            } as Response;
        });

        const result = await resolveTileSources({
            sources: [
                'https://example.org/public/info.json',
                'https://example.org/protected/info.json',
            ],
        });

        expect(result).toEqual({ ok: false, error: { type: 'auth' } });
    });

    it('hides low single-tile levels and preserves tiled zoom-in for level-0', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            status: 200,
            ok: true,
            json: async () => ({
                '@context': 'http://iiif.io/api/image/3/context.json',
                id: 'https://example.org/iiif/image',
                width: 4000,
                height: 3000,
                version: 3,
                profile: 'https://iiif.io/api/image/3/level0.json',
                scale_factors: [1, 2, 4],
            }),
        } as Response);

        const osd = { IIIFTileSource: FakeIIIFTileSource };
        const result = await resolveTileSources({
            sources: ['https://example.org/iiif/image/info.json'],
            osd,
            viewport: { width: 1200, height: 900 },
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            const source = result.resolved[0];
            expect(source.minLevel).toBe(2);
            expect(source.getNumTiles(0)).toEqual({ x: 0, y: 0 });
            expect(source.getNumTiles(1)).toEqual({ x: 0, y: 0 });
            expect(source.getNumTiles(2)).toEqual({ x: 2, y: 2 });
            expect(source.getTileUrl(2, 1, 0)).toBe('tile/2/1/0');
        }
    });

    it('forces full-image requests for unadvertised scale-factor levels', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            status: 200,
            ok: true,
            json: async () => ({
                '@context': 'http://iiif.io/api/image/3/context.json',
                id: 'https://example.org/iiif/image',
                width: 4000,
                height: 3000,
                version: 3,
                profile: 'https://iiif.io/api/image/3/level0.json',
                // level scale factors for maxLevel=2 are [4,2,1]; omit 2.
                scale_factors: [1, 4],
            }),
        } as Response);

        const osd = { IIIFTileSource: FakeIIIFTileSource };
        const result = await resolveTileSources({
            sources: ['https://example.org/iiif/image/info.json'],
            osd,
            viewport: { width: 500, height: 500 },
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            const source = result.resolved[0];
            expect(source.getNumTiles(1)).toEqual({ x: 0, y: 0 });
            expect(source.getTileUrl(1, 0, 0)).toBe('tile/2/0/0');
            // Highest level is still advertised and remains tiled.
            expect(source.getTileUrl(2, 1, 0)).toBe('tile/2/1/0');
        }
    });

    it('passes through string sources on fetch/network failure', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

        const source = 'https://example.org/iiif/image/info.json';
        const result = await resolveTileSources({ sources: [source] });

        expect(result).toEqual({ ok: true, resolved: [source] });
    });
});

describe('toLayoutSource', () => {
    it("keeps a positioned wrapper's placement and reads dimensions off its tile source", () => {
        const tileSource = { width: 4000, height: 3000 };

        expect(
            toLayoutSource({
                canvasId: 'canvas-1',
                x: 0.25,
                y: 0.5,
                width: 0.75,
                tileSource,
            }),
        ).toEqual({
            tileSource,
            canvasId: 'canvas-1',
            x: 0.25,
            y: 0.5,
            width: 0.75,
            sourceWidth: 4000,
            sourceHeight: 3000,
        });
    });

    it('treats a bare tile source as filling its own canvas', () => {
        const tileSource = { width: 1000, height: 2000 };

        expect(toLayoutSource(tileSource)).toEqual({
            tileSource,
            canvasId: undefined,
            x: 0,
            y: 0,
            width: 1,
            sourceWidth: 1000,
            sourceHeight: 2000,
        });
    });

    it('leaves dimensions undefined for a source that reports none', () => {
        const source = 'https://example.org/iiif/image/info.json';

        expect(toLayoutSource(source)).toEqual({
            tileSource: source,
            canvasId: undefined,
            x: 0,
            y: 0,
            width: 1,
            sourceWidth: undefined,
            sourceHeight: undefined,
        });
    });

    it("passes a positioned wrapper's missing placement through for layout to default", () => {
        const tileSource = { width: 10, height: 10 };

        expect(toLayoutSource({ tileSource })).toMatchObject({
            tileSource,
            canvasId: undefined,
            x: undefined,
            y: undefined,
            width: undefined,
        });
    });
});
