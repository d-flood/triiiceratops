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

    it('records the declared compliance level0, which no advertised key implies', () => {
        // The one fact read off `profile`. "Advertises no tiles" is NOT the
        // same claim — level 1/2 services omit `tiles` too, and answer any
        // region anyway — so without this the renderer cannot tell a size
        // ladder from a service it may tile itself.
        expect(parseImageService(LEVEL2_V3)?.level0).toBeUndefined();
        expect(
            parseImageService({ ...LEVEL2_V3, profile: 'level0' })?.level0,
        ).toBe(true);
        expect(
            parseImageService({
                '@context': 'http://iiif.io/api/image/2/context.json',
                '@id': SERVICE,
                profile: ['http://iiif.io/api/image/2/level0.json'],
                width: 1000,
                height: 800,
            })?.level0,
        ).toBe(true);
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

    /*
     * The query a HOST needs, and the reason it is not `failure()`. A failure
     * with attempts left is a claim the next `ensure` may withdraw, so an error
     * placeholder shown on it flashes: a 503 records `load`, the placeholder
     * appears, the retry succeeds, and it disappears again. `spent` is "the
     * question is closed".
     */
    it('reports a failure as spent only once nothing will ask again', async () => {
        const { cache } = cacheWith(async () => ({ status: 503, json: null }));

        // Nothing has failed at all.
        expect(cache.spent(SERVICE)).toBe(false);

        // Attempt one of two: a kind is already reportable, but the question is
        // still open.
        expect(await cache.ensure(SERVICE)).toBeNull();
        expect(cache.failure(SERVICE)).toBe('load');
        expect(cache.spent(SERVICE)).toBe(false);

        // Attempt two exhausts the allowance.
        expect(await cache.ensure(SERVICE)).toBeNull();
        expect(cache.spent(SERVICE)).toBe(true);
    });

    it('reports a deterministic failure as spent on the first attempt', async () => {
        // A 401 is an ANSWER, so there is no second attempt to wait for and a
        // reader can be told immediately.
        const auth = cacheWith(async () => ({ status: 401, json: null }));
        await auth.cache.ensure(SERVICE);
        expect(auth.cache.spent(SERVICE)).toBe(true);

        const junk = cacheWith(async () => ({ status: 200, json: {} }));
        await junk.cache.ensure(SERVICE);
        expect(junk.cache.spent(SERVICE)).toBe(true);
    });

    it('reopens the question on a mount, so a spent transient failure stops being spent', async () => {
        const { cache } = cacheWith(async () => ({ status: 503, json: null }));

        await cache.ensure(SERVICE);
        await cache.ensure(SERVICE);
        expect(cache.spent(SERVICE)).toBe(true);

        cache.retryTransientFailures();
        expect(cache.spent(SERVICE)).toBe(false);
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

    describe('the bounded in-flight window', () => {
        /**
         * A fetch that never settles on its own, so the number of calls made IS
         * the number outstanding.
         */
        function blockingCache(maxConcurrent: number) {
            const release: Array<() => void> = [];
            const fetchJson = vi.fn(
                () =>
                    new Promise<{ status: number; json: unknown }>(
                        (resolve) => {
                            release.push(() =>
                                resolve({ status: 200, json: LEVEL2_V3 }),
                            );
                        },
                    ),
            );

            return {
                cache: createImageServiceCache({ fetchJson, maxConcurrent }),
                fetchJson,
                release,
            };
        }

        const services = (count: number) =>
            Array.from({ length: count }, (_, index) => `${SERVICE}/${index}`);

        it('never has more than the cap outstanding, however many are asked at once', async () => {
            // The failure this prevents: at the derived zoom floor ~50 canvases
            // are in the residency window, every one is thumbnail tier, and a
            // level0 manifest resolves every one to "fetch info.json". Gated but
            // uncapped, the first frame after a flick settles starts fifty
            // simultaneous requests — the fetch storm the epic exists to remove,
            // one frame later rather than not at all.
            const { cache, fetchJson, release } = blockingCache(6);

            for (const service of services(50)) void cache.ensure(service);
            await Promise.resolve();

            expect(fetchJson).toHaveBeenCalledTimes(6);

            // A slot freed admits exactly one more.
            release[0]();
            await vi.waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(7));
        });

        it('drains the queue in the order it was asked, which is centre-out', async () => {
            // The planner emits its list ordered by distance from the viewport
            // centre and re-emits it every frame, so FIFO here is the priority
            // the reader cares about.
            const { cache, fetchJson, release } = blockingCache(1);

            for (const service of services(3)) void cache.ensure(service);
            await Promise.resolve();

            expect(fetchJson).toHaveBeenLastCalledWith(
                `${SERVICE}/0/info.json`,
            );

            release[0]();
            await vi.waitFor(() =>
                expect(fetchJson).toHaveBeenLastCalledWith(
                    `${SERVICE}/1/info.json`,
                ),
            );
        });

        it('still dedupes a queued service, so a frame loop does not fill the queue', async () => {
            // `ensure` is called every frame with the planner's whole list. A
            // service waiting for a slot must join the pending promise exactly
            // as an in-flight one does, or sixty frames of waiting would become
            // sixty queue entries.
            const { cache, fetchJson, release } = blockingCache(1);

            const first = cache.ensure(`${SERVICE}/a`);
            void cache.ensure(`${SERVICE}/b`);
            const again = cache.ensure(`${SERVICE}/b`);
            void cache.ensure(`${SERVICE}/b`);

            release[0]();
            await first;
            await vi.waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(2));

            release[1]();
            await expect(again).resolves.toMatchObject({ width: 4096 });
            expect(fetchJson).toHaveBeenCalledTimes(2);
        });

        it('frees its slot when a service fails, so one bad server cannot stall the queue', async () => {
            const release: Array<(status: number) => void> = [];
            const fetchJson = vi.fn(
                () =>
                    new Promise<{ status: number; json: unknown }>(
                        (resolve) => {
                            release.push((status) =>
                                resolve({ status, json: null }),
                            );
                        },
                    ),
            );
            const cache = createImageServiceCache({
                fetchJson,
                maxConcurrent: 1,
            });

            void cache.ensure(`${SERVICE}/a`);
            void cache.ensure(`${SERVICE}/b`);
            await Promise.resolve();
            expect(fetchJson).toHaveBeenCalledTimes(1);

            release[0](500);
            await vi.waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(2));
        });
    });
});
