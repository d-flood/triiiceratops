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

    function createBoundedCache(maxEntries: number) {
        const fetchJson = vi.fn(ok);
        return {
            cache: createImageServiceCache({ fetchJson, maxEntries }),
            fetchJson,
        };
    }

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

    it('gives a failure one retry, then stops asking rather than retrying every frame', async () => {
        const { cache, fetchJson } = cacheWith(async () => ({
            status: 503,
            json: null,
        }));

        // Called once per frame while the canvas is on screen.
        for (let frame = 0; frame < 5; frame += 1) {
            expect(await cache.ensure(SERVICE)).toBeNull();
        }

        expect(fetchJson).toHaveBeenCalledTimes(2);
        expect(cache.failure(SERVICE)).toBe('load');
    });

    it('distinguishes an authentication failure from a load failure', async () => {
        const { cache } = cacheWith(async () => ({ status: 401, json: null }));

        expect(await cache.ensure(SERVICE)).toBeNull();
        expect(cache.failure(SERVICE)).toBe('auth');
    });

    it('never retries an answer: 401 and an unparseable document are permanent', async () => {
        // Both are the server telling us something true. Repeating the question
        // cannot change either, so neither is reopened by a remount.
        const auth = cacheWith(async () => ({ status: 401, json: null }));
        await auth.cache.ensure(SERVICE);
        await auth.cache.ensure(SERVICE);
        auth.cache.retryTransientFailures();
        await auth.cache.ensure(SERVICE);
        expect(auth.fetchJson).toHaveBeenCalledTimes(1);

        const junk = cacheWith(async () => ({ status: 200, json: {} }));
        await junk.cache.ensure(SERVICE);
        await junk.cache.ensure(SERVICE);
        junk.cache.retryTransientFailures();
        await junk.cache.ensure(SERVICE);
        expect(junk.fetchJson).toHaveBeenCalledTimes(1);
    });

    it('reopens a transient failure on the next mount rather than blanking the canvas forever', async () => {
        // This cache outlives the renderer, the manifest, and SPA navigation. A
        // dropped connection recorded permanently means that canvas paints
        // nothing for the rest of the page's life, with nothing on screen to
        // say why.
        let offline = true;
        const { cache, fetchJson } = cacheWith(async () => {
            if (offline) throw new Error('offline');
            return { status: 200, json: LEVEL2_V3 };
        });

        expect(await cache.ensure(SERVICE)).toBeNull();
        expect(cache.failure(SERVICE)).toBe('load');

        offline = false;
        cache.retryTransientFailures();

        expect(await cache.ensure(SERVICE)).toMatchObject({ width: 4096 });
        expect(cache.failure(SERVICE)).toBeUndefined();
        expect(fetchJson).toHaveBeenCalledTimes(2);
    });

    it('forgets a service on invalidate, and everything on clear', async () => {
        const { cache, fetchJson } = cacheWith(ok);

        await cache.ensure(SERVICE);
        cache.invalidate(SERVICE);
        await cache.ensure(SERVICE);
        expect(fetchJson).toHaveBeenCalledTimes(2);

        cache.clear();
        expect(cache.get(SERVICE)).toBeUndefined();
        await cache.ensure(SERVICE);
        expect(fetchJson).toHaveBeenCalledTimes(3);
    });

    it('bounds what it holds: it is page-shared and nothing else evicts it', async () => {
        const { cache } = createBoundedCache(2);

        await cache.ensure('https://images.test/a');
        await cache.ensure('https://images.test/b');
        await cache.ensure('https://images.test/c');

        expect(cache.get('https://images.test/a')).toBeUndefined();
        expect(cache.get('https://images.test/c')).toBeDefined();
    });

    it('keeps services apart', async () => {
        const { cache, fetchJson } = cacheWith(ok);

        await cache.ensure(SERVICE);
        await cache.ensure('https://images.test/other');

        expect(fetchJson).toHaveBeenCalledTimes(2);
    });
});
