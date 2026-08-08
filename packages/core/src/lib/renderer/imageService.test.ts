// @vitest-environment node
/**
 * Image-service metadata: what `info.json` parses to, and that it is fetched
 * once, ever.
 *
 * Node environment, and a fake fetch — the cache's decisions (dedupe, the
 * permanent failure entry, the separate lifetime from decoded pixels) are
 * ordinary data decisions and need no browser to assert.
 */

import { describe, expect, it, vi } from 'vitest';

import { createImageServiceCache, parseImageService } from './imageService';

const SERVICE = 'https://images.test/abc';

const LEVEL2_V3 = {
    '@context': 'http://iiif.io/api/image/3/context.json',
    id: SERVICE,
    type: 'ImageService3',
    protocol: 'http://iiif.io/api/image',
    profile: 'level2',
    width: 4096,
    height: 3072,
    tiles: [{ width: 512, scaleFactors: [1, 2, 4, 8] }],
    sizes: [{ width: 512, height: 384 }],
};

describe('parseImageService', () => {
    it('reads the facts a version 3 level 2 service advertises', () => {
        expect(parseImageService(LEVEL2_V3)).toEqual({
            width: 4096,
            height: 3072,
            version: 3,
            tileSize: 512,
            scaleFactors: [1, 2, 4, 8],
            sizes: [{ width: 512, height: 384 }],
        });
    });

    it('recognises a version 2 service from its context', () => {
        const facts = parseImageService({
            '@context': 'http://iiif.io/api/image/2/context.json',
            '@id': SERVICE,
            profile: ['http://iiif.io/api/image/2/level2.json'],
            width: 1000,
            height: 800,
            tiles: [{ width: 256, scaleFactors: [1, 2] }],
        });

        expect(facts).toMatchObject({ version: 2, tileSize: 256 });
    });

    it('reads a preferred format, so tiles are asked for in one the server likes', () => {
        expect(
            parseImageService({ ...LEVEL2_V3, preferredFormats: ['png'] }),
        ).toMatchObject({ format: 'png' });
    });

    it('records no tiling for a service that advertises only sizes', () => {
        const facts = parseImageService({
            ...LEVEL2_V3,
            profile: 'level0',
            tiles: undefined,
        });

        expect(facts?.tileSize).toBeUndefined();
        expect(facts?.sizes).toEqual([{ width: 512, height: 384 }]);
    });

    it('rejects a document with no usable dimensions', () => {
        expect(parseImageService({ width: 0, height: 10 })).toBeNull();
        expect(parseImageService({})).toBeNull();
        expect(parseImageService(null)).toBeNull();
        expect(parseImageService('not a service')).toBeNull();
    });
});

describe('createImageServiceCache', () => {
    function cacheWith(
        respond: (url: string) => Promise<{ status: number; json: unknown }>,
    ) {
        const fetchJson = vi.fn(respond);
        return { cache: createImageServiceCache({ fetchJson }), fetchJson };
    }

    const ok = async () => ({ status: 200, json: LEVEL2_V3 });

    it('fetches info.json from the service id', async () => {
        const { cache, fetchJson } = cacheWith(ok);

        await cache.ensure(SERVICE);

        expect(fetchJson).toHaveBeenCalledWith(`${SERVICE}/info.json`);
    });

    it('fetches once however many times it is asked — a frame loop asks every frame', async () => {
        const { cache, fetchJson } = cacheWith(ok);

        await Promise.all([
            cache.ensure(SERVICE),
            cache.ensure(SERVICE),
            cache.ensure(SERVICE),
        ]);
        await cache.ensure(SERVICE);

        expect(fetchJson).toHaveBeenCalledTimes(1);
        expect(cache.requestCount).toBe(1);
    });

    it('answers from cache without a fetch once the facts are known', async () => {
        const { cache, fetchJson } = cacheWith(ok);

        await cache.ensure(SERVICE);
        expect(cache.get(SERVICE)).toMatchObject({ width: 4096 });

        // Re-entering a canvas must not refetch metadata: this is the whole
        // reason it is a separate cache from the decoded pixels.
        await cache.ensure(SERVICE);
        expect(fetchJson).toHaveBeenCalledTimes(1);
    });

    it('remembers a failure permanently rather than retrying it every frame', async () => {
        const { cache, fetchJson } = cacheWith(async () => ({
            status: 404,
            json: null,
        }));

        expect(await cache.ensure(SERVICE)).toBeNull();
        expect(await cache.ensure(SERVICE)).toBeNull();
        expect(await cache.ensure(SERVICE)).toBeNull();

        expect(fetchJson).toHaveBeenCalledTimes(1);
        expect(cache.failure(SERVICE)).toBe('load');
    });

    it('distinguishes an authentication failure from a load failure', async () => {
        const { cache } = cacheWith(async () => ({ status: 401, json: null }));

        expect(await cache.ensure(SERVICE)).toBeNull();
        expect(cache.failure(SERVICE)).toBe('auth');
    });

    it('treats a network error as a permanent load failure', async () => {
        const { cache, fetchJson } = cacheWith(async () => {
            throw new Error('offline');
        });

        expect(await cache.ensure(SERVICE)).toBeNull();
        await cache.ensure(SERVICE);

        expect(fetchJson).toHaveBeenCalledTimes(1);
        expect(cache.failure(SERVICE)).toBe('load');
    });

    it('keeps services apart', async () => {
        const { cache, fetchJson } = cacheWith(ok);

        await cache.ensure(SERVICE);
        await cache.ensure('https://images.test/other');

        expect(fetchJson).toHaveBeenCalledTimes(2);
    });
});
