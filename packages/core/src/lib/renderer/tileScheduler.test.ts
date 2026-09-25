// @vitest-environment node
/**
 * The tile scheduler, against a stubbed `fetch` and `createImageBitmap`.
 *
 * Ordering, the in-flight window, the cancellation policy, and the negative
 * cache are decisions over planner output, so they are asserted here rather
 * than in a browser. Node environment: nothing in this graph may reach for a
 * DOM global at import time, and the two browser globals the loader does use at
 * call time are stubbed per test.
 *
 * A rejected `fetch` is the CORS case, which the loader answers with an
 * `<img>`; a real tile failure is an HTTP answer. So a test that wants a
 * FAILURE resolves a non-`ok` response — {@link Pending.reject} — and nothing
 * here rejects `fetch` except an abort.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTileScheduler, type DecodedTile } from './tileScheduler';
import type { TileRequest } from './types';

afterEach(() => {
    vi.unstubAllGlobals();
});

/**
 * A decode that lands at once, at a fixed 10×20 — so a budget stated in whole
 * tiles below is arithmetic rather than a magic number. Answers with the
 * `close` spies in the order the decodes landed, for the tests that assert a
 * tile's pixels were released rather than dropped.
 */
function immediateDecode(size = { width: 10, height: 20 }) {
    const closes: Array<() => void> = [];

    vi.stubGlobal('createImageBitmap', () => {
        const close = vi.fn();
        closes.push(close);
        return Promise.resolve({ ...size, close });
    });

    return { closes, decoded: () => closes.length };
}

interface Pending {
    url: string;
    signal: AbortSignal;
    resolve(): void;
    /** Answer with an HTTP status the loader must treat as a dead tile. */
    reject(): void;
}

/**
 * A `fetch` that hands back control: every request stays pending until the test
 * settles it by hand, which is the only way to observe a *window* rather than a
 * sequence.
 */
function controllableFetch() {
    const pending: Pending[] = [];

    vi.stubGlobal(
        'fetch',
        (url: string, init?: { signal?: AbortSignal }) =>
            new Promise((resolve, reject) => {
                const signal = init!.signal!;
                pending.push({
                    url,
                    signal,
                    resolve: () =>
                        resolve({ ok: true, blob: async () => ({ size: 1 }) }),
                    reject: () => resolve({ ok: false, status: 404 }),
                });
                signal.addEventListener('abort', () =>
                    reject(new Error('aborted')),
                );
            }),
    );

    const decode = immediateDecode();

    return {
        pending,
        byUrl: (url: string) => pending.filter((entry) => entry.url === url),
        settleAll() {
            for (const entry of [...pending]) entry.resolve();
        },
        /** `close` spies, in the order the decodes landed. */
        closes: decode.closes,
        /** How many tiles have been decoded. */
        decoded: decode.decoded,
    };
}

/**
 * A `fetch` whose ABORT hands back control too: `abort()` marks the request and
 * leaves it on the wire until the test says the cancellation landed.
 *
 * {@link controllableFetch} rejects on `abort` immediately, which is what the JS
 * promise does but not what the connection does — a browser's socket is busy
 * until the cancellation reaches the network stack. That gap is the only place
 * an over-subscribed window is observable, so it needs a stub of its own.
 */
function lingeringFetch() {
    interface Entry {
        url: string;
        signal: AbortSignal;
        settled: boolean;
        settle(): void;
    }
    const entries: Entry[] = [];

    vi.stubGlobal(
        'fetch',
        (url: string, init?: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => {
                const entry: Entry = {
                    url,
                    signal: init!.signal!,
                    settled: false,
                    settle() {
                        entry.settled = true;
                        reject(new Error('aborted'));
                    },
                };
                entries.push(entry);
            }),
    );

    return {
        entries,
        /** Requests the network has neither answered nor finished tearing down. */
        onWire: () => entries.filter((entry) => !entry.settled),
        aborted: () => entries.filter((entry) => entry.signal.aborted),
        /** The cancellations land: every aborted request leaves the wire. */
        settleAborted() {
            for (const entry of entries) {
                if (entry.signal.aborted && !entry.settled) entry.settle();
            }
        },
    };
}

/**
 * A decode that hands back control, the way {@link controllableFetch} does for
 * the network — the only way to hold a decode open across an `update`, which is
 * the window in which a tile can be superseded by one that has already landed.
 */
function controllableDecode() {
    const pending: Array<{ close: () => void; settle(): void }> = [];

    vi.stubGlobal(
        'createImageBitmap',
        () =>
            new Promise<DecodedTile>((resolve) => {
                const close = vi.fn();
                pending.push({
                    close,
                    settle: () => resolve({ width: 4, height: 4, close }),
                });
            }),
    );

    return { pending };
}

/**
 * The required set's own bytes, summed the way the devtools handle sums them —
 * the scheduler bills 4 bytes per pixel of decoded RGBA.
 */
function requiredBytes(tiles: ReturnType<typeof createTileScheduler>): number {
    let bytes = 0;
    for (const key of tiles.residentKeys()) {
        const tile = tiles.get(key)!;
        bytes += tile.width * tile.height * 4;
    }
    return bytes;
}

function request(index: number, priority = index): TileRequest {
    return {
        key: `c1#0/${index},0`,
        canvasId: 'c1',
        level: 0,
        url: `https://images.test/abc/tile-${index}.jpg`,
        priority,
    };
}

/** Let every already-resolved promise callback run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function scheduler(
    options: {
        maxInFlight?: number;
        maxAttempts?: number;
        byteBudget?: number;
        onChange?: () => void;
    } = {},
) {
    return createTileScheduler({
        maxInFlight: options.maxInFlight ?? 2,
        maxAttempts: options.maxAttempts ?? 2,
        // No opportunistic cache by default, which is what makes every
        // assertion below about the REQUIRED set alone. The cache has its own
        // describe block, with its own budget.
        byteBudget: options.byteBudget ?? 0,
        onChange: options.onChange,
    });
}

describe('createTileScheduler', () => {
    it('never exceeds the in-flight window', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 3 });

        tiles.update([0, 1, 2, 3, 4, 5, 6, 7].map((i) => request(i)));
        await flush();

        expect(net.pending).toHaveLength(3);

        net.pending[0].resolve();
        await flush();
        // One completed, one started: the window stays full, never over.
        expect(
            net.pending.filter((entry) => !entry.signal.aborted),
        ).toHaveLength(4);
    });

    it('starts the nearest tiles first, not the first ones discovered', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 2 });

        // Discovery order 0,1,2,3; priority says 3 and 1 are nearest.
        tiles.update([
            request(0, 90),
            request(1, 10),
            request(2, 50),
            request(3, 1),
        ]);
        await flush();

        expect(net.pending.map((entry) => entry.url)).toEqual([
            'https://images.test/abc/tile-3.jpg',
            'https://images.test/abc/tile-1.jpg',
        ]);
    });

    it('aborts a request the moment it leaves the required set', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 2 });

        tiles.update([request(0), request(1)]);
        await flush();
        expect(net.pending.every((entry) => !entry.signal.aborted)).toBe(true);

        // A pan: tile 0 is gone from the required set.
        tiles.update([request(1), request(2)]);
        await flush();

        expect(
            net.byUrl('https://images.test/abc/tile-0.jpg')[0].signal.aborted,
        ).toBe(true);
        expect(
            net.byUrl('https://images.test/abc/tile-1.jpg')[0].signal.aborted,
        ).toBe(false);
    });

    it('keeps an aborting request inside the window until it settles', async () => {
        // The window bounds what is ON THE WIRE, and `abort()` does not take a
        // request off it: the socket is busy until the cancellation lands.
        // Freeing the slot on `abort()` instead lets the surplus stack across
        // the frames of a pan — measured page-side at eleven simultaneous live
        // fetches against a limit of six on the 800-canvas fixture, the surplus
        // being requests the scheduler had already aborted.
        const net = lingeringFetch();
        const tiles = scheduler({ maxInFlight: 2 });

        tiles.update([request(0), request(1)]);
        await flush();
        expect(net.onWire()).toHaveLength(2);

        // A pan: both tiles leave the required set and two others take their
        // place. The replacements must WAIT — the wire is still full.
        tiles.update([request(2), request(3)]);
        await flush();

        expect(net.aborted()).toHaveLength(2);
        expect(
            net.onWire(),
            'the window was doubled by two requests still being cancelled',
        ).toHaveLength(2);

        // …and the moment the cancellations land, the replacements start. The
        // slot is deferred, not lost.
        net.settleAborted();
        await flush();
        expect(net.onWire().map((entry) => entry.url)).toEqual([
            'https://images.test/abc/tile-2.jpg',
            'https://images.test/abc/tile-3.jpg',
        ]);
    });

    it('does not restart a request that is already in flight for the same tile', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 4 });

        tiles.update([request(0)]);
        await flush();
        tiles.update([request(0)]);
        tiles.update([request(0)]);
        await flush();

        expect(net.pending).toHaveLength(1);
        expect(tiles.requestCount).toBe(1);
    });

    it('discards a tile that left the viewport while it was decoding', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 2 });

        tiles.update([request(0)]);
        await flush();

        // Superseded after the fetch resolved but before the decode landed:
        // caching it here is how a fast zoom fills memory with pixels nobody
        // asked for.
        const before = net.decoded();
        net.pending[0].resolve();
        tiles.update([request(5)]);
        await flush();

        expect(net.decoded()).toBeGreaterThan(before);
        expect(tiles.get(request(0).key)).toBeUndefined();
        expect(tiles.residentKeys().size).toBe(0);
    });

    it('holds a tile that is still required when its decode lands', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 2 });

        tiles.update([request(0)]);
        await flush();
        net.pending[0].resolve();
        await flush();

        expect(tiles.get(request(0).key)).toBeDefined();
        expect(tiles.residentKeys().has(request(0).key)).toBe(true);
    });

    it('reports resident tiles and decoded bytes, and they follow what is held', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 4 });

        tiles.update([request(0), request(1)]);
        await flush();
        net.settleAll();
        await flush();

        expect(tiles.residentKeys().size).toBe(2);
        // 10x20 at 4 bytes per pixel, twice.
        expect(tiles.decodedBytes).toBe(2 * 10 * 20 * 4);

        // Releasing what is no longer required takes its bytes with it —
        // browser heap metrics could not see this, because decoded images live
        // outside the JS heap.
        tiles.update([request(0)]);
        expect(tiles.residentKeys().size).toBe(1);
        expect(tiles.decodedBytes).toBe(10 * 20 * 4);
    });

    it('closes a released tile rather than leaking it outside the JS heap', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 2 });

        tiles.update([request(0)]);
        await flush();
        net.settleAll();
        await flush();

        tiles.update([]);
        expect(net.closes[0]).toHaveBeenCalled();
    });

    it('closes a decode that lands behind the attempt that replaced it, and keeps only one', async () => {
        // The case a tile key alone cannot express. Aborting cannot cancel a
        // `createImageBitmap` already under way, so the first attempt's decode
        // settles AFTER the tile has been dropped, re-required, and re-fetched.
        //
        // Retired by key rather than by attempt, that late arrival deletes the
        // NEW attempt's controller: the request becomes untracked and
        // unabortable, `inFlight` undercounts so the window opens past its
        // limit, and the tile is re-queued every frame. Dropped without
        // `close()`, its pixels leak outside the JS heap where neither the heap
        // metrics nor `decodedBytes` can see them.
        const net = controllableFetch();
        const decodes = controllableDecode();
        const tiles = scheduler({ maxInFlight: 4 });
        const url = 'https://images.test/abc/tile-0.jpg';

        tiles.update([request(0)]);
        await flush();
        net.byUrl(url)[0].resolve();
        await flush();
        expect(decodes.pending).toHaveLength(1);

        // A pan away and straight back: the first decode is still running.
        tiles.update([]);
        tiles.update([request(0)]);
        await flush();
        expect(net.byUrl(url)).toHaveLength(2);
        net.byUrl(url)[1].resolve();
        await flush();
        expect(decodes.pending).toHaveLength(2);

        // The SUPERSEDED decode lands first, while the attempt that replaced it
        // is still outstanding. It must close its own bitmap and retire nothing
        // but itself.
        decodes.pending[0].settle();
        await flush();
        expect(decodes.pending[0].close).toHaveBeenCalled();

        // Retired by key, the line above would have deleted the second
        // attempt's controller — so this frame would start a third request for
        // a tile that is already being fetched, and would do so every frame.
        tiles.update([request(0)]);
        await flush();
        expect(net.byUrl(url)).toHaveLength(2);
        expect(
            net.byUrl(url).filter((entry) => !entry.signal.aborted),
        ).toHaveLength(1);

        decodes.pending[1].settle();
        await flush();

        expect(tiles.residentKeys().size).toBe(1);
        expect(tiles.decodedBytes).toBe(4 * 4 * 4);
        expect(decodes.pending[1].close).not.toHaveBeenCalled();
    });

    it('retries a failed tile once, then never asks for that URL again', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 2, maxAttempts: 2 });
        const url = 'https://images.test/abc/tile-0.jpg';

        tiles.update([request(0)]);
        await flush();
        net.byUrl(url)[0].reject();
        await flush();

        expect(net.byUrl(url)).toHaveLength(2);
        net.byUrl(url)[1].reject();
        await flush();

        // Permanently dead: re-planned every frame it is visible, requested
        // never again.
        for (let frame = 0; frame < 5; frame += 1) {
            tiles.update([request(0)]);
            await flush();
        }

        expect(net.byUrl(url)).toHaveLength(2);
        expect(tiles.requestCount).toBe(2);
    });

    it('spends the retry of a failed request on its alternate spelling', async () => {
        // The version 2 `default`/`native` deviation: right for every endpoint
        // built since 2016, wrong for a frozen static tree — and for a
        // size-ladder source, being wrong means every rung dies and the canvas
        // is blank for the life of the page rather than merely blurrier.
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 2, maxAttempts: 2 });
        const canonical = 'https://images.test/abc/tile-0.jpg';
        const alternate = 'https://images.test/abc/tile-0.native.jpg';

        const withFallback = (index: number): TileRequest => ({
            ...request(index),
            fallback: {
                url: `https://images.test/abc/tile-${index}.native.jpg`,
                group: 'https://images.test/abc',
            },
        });

        tiles.update([withFallback(0)]);
        await flush();

        // The happy path asks one way only: the fallback is reached from a
        // failure, never speculatively.
        expect(net.byUrl(canonical)).toHaveLength(1);
        expect(net.byUrl(alternate)).toHaveLength(0);

        net.byUrl(canonical)[0].reject();
        await flush();

        // The retry it already had, redirected. No extra attempt was granted.
        expect(net.byUrl(alternate)).toHaveLength(1);
        net.byUrl(alternate)[0].resolve();
        await flush();

        // And remembered for the SERVICE: one wasted request buys the answer
        // for the whole ladder, not one per rung.
        tiles.update([withFallback(0), withFallback(1)]);
        await flush();
        expect(net.byUrl('https://images.test/abc/tile-1.jpg')).toHaveLength(0);
        expect(
            net.byUrl('https://images.test/abc/tile-1.native.jpg'),
        ).toHaveLength(1);
    });

    it('kills a request whose alternate spelling fails too, on its original url', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 2, maxAttempts: 2 });
        const canonical = 'https://images.test/abc/tile-0.jpg';
        const alternate = 'https://images.test/abc/tile-0.native.jpg';
        const broken: TileRequest = {
            ...request(0),
            fallback: { url: alternate, group: 'https://images.test/abc' },
        };

        tiles.update([broken]);
        await flush();
        net.byUrl(canonical)[0].reject();
        await flush();
        net.byUrl(alternate)[0].reject();
        await flush();

        // Two attempts total, then permanently dead — the failure counter and
        // the negative cache are keyed on the original url, so a second
        // spelling cannot buy a second budget.
        for (let frame = 0; frame < 5; frame += 1) {
            tiles.update([broken]);
            await flush();
        }
        expect(tiles.requestCount).toBe(2);
    });

    it('does not count an abort as a failure', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 2, maxAttempts: 2 });
        const url = 'https://images.test/abc/tile-0.jpg';

        // A fast pan aborts by design; letting that poison the negative cache
        // would blank tiles that were never broken.
        tiles.update([request(0)]);
        await flush();
        tiles.update([]);
        await flush();

        tiles.update([request(0)]);
        await flush();
        expect(net.byUrl(url)).toHaveLength(2);
        expect(net.byUrl(url)[1].signal.aborted).toBe(false);
    });

    it('announces a change only when the resident set actually changed', async () => {
        const net = controllableFetch();
        const onChange = vi.fn();
        const tiles = scheduler({ maxInFlight: 2, onChange });

        tiles.update([request(0)]);
        await flush();
        expect(onChange).not.toHaveBeenCalled();

        net.settleAll();
        await flush();
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('aborts everything and releases every tile on dispose', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 2 });

        tiles.update([request(0), request(1), request(2)]);
        await flush();
        net.pending[0].resolve();
        await flush();

        tiles.dispose();

        expect(tiles.residentKeys().size).toBe(0);
        expect(tiles.decodedBytes).toBe(0);
        expect(net.pending.some((entry) => entry.signal.aborted)).toBe(true);

        // And it stays inert: a late frame must not start new work.
        tiles.update([request(9)]);
        await flush();
        expect(net.byUrl('https://images.test/abc/tile-9.jpg')).toHaveLength(0);
    });
});

/**
 * The **opportunistic cache**: what was recently dropped from the
 * required set, held under an LRU capped by a byte budget.
 *
 * A tile here is 10x20 at 4 bytes per pixel — 800 bytes — so a budget stated in
 * whole tiles below is arithmetic rather than a magic number.
 */
const TILE_BYTES = 10 * 20 * 4;

describe('createTileScheduler — the opportunistic cache', () => {
    /** Fetch, settle, and hold the given tiles as the required set. */
    async function hold(
        tiles: ReturnType<typeof createTileScheduler>,
        net: ReturnType<typeof controllableFetch>,
        indices: number[],
    ) {
        tiles.update(indices.map((index) => request(index)));
        await flush();
        net.settleAll();
        await flush();
    }

    it('holds a dropped tile rather than closing it, and takes it back with no request', async () => {
        const net = controllableFetch();
        const tiles = scheduler({
            maxInFlight: 4,
            byteBudget: 8 * TILE_BYTES,
        });

        await hold(tiles, net, [0, 1]);
        expect(tiles.residentKeys().size).toBe(2);

        // Scrolled away. The required set is smaller; nothing was released.
        tiles.update([request(2)]);
        expect(tiles.residentKeys().size).toBe(0);
        expect(tiles.cachedTileCount).toBe(2);
        expect(tiles.decodedBytes).toBe(2 * TILE_BYTES);

        // Scrolled back. Both come out of the cache, and the network is never
        // asked a second time.
        const before = tiles.requestCount;
        tiles.update([request(0), request(1)]);
        expect(tiles.residentKeys().size).toBe(2);
        expect(tiles.cachedTileCount).toBe(0);
        expect(tiles.requestCount).toBe(before);
        expect(net.byUrl('https://images.test/abc/tile-0.jpg')).toHaveLength(1);
    });

    it('asks for a repaint when a cached tile comes back, since no decode will', async () => {
        const net = controllableFetch();
        const onChange = vi.fn();
        const tiles = scheduler({
            maxInFlight: 4,
            byteBudget: 8 * TILE_BYTES,
            onChange,
        });

        await hold(tiles, net, [0]);
        onChange.mockClear();

        tiles.update([request(1)]);
        await flush();
        onChange.mockClear();

        // Nothing lands: the tile was already decoded. Without this the frame
        // that would paint it is never scheduled.
        tiles.update([request(0)]);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('evicts the least recently dropped tile first', async () => {
        const net = controllableFetch();
        const tiles = scheduler({
            maxInFlight: 4,
            // Room for the one required tile and exactly one cached one.
            byteBudget: 2 * TILE_BYTES,
        });

        await hold(tiles, net, [0, 1]);
        // Drop 0, then 1: 1 is the more recent, so 0 is the one that goes.
        tiles.update([request(1), request(2)]);
        await flush();
        net.settleAll();
        await flush();
        tiles.update([request(2)]);

        expect(tiles.decodedBytes).toBeLessThanOrEqual(2 * TILE_BYTES);
        // Tile 1 survived and comes back free; tile 0 has to be refetched.
        const before = tiles.requestCount;
        tiles.update([request(1), request(2)]);
        expect(tiles.requestCount).toBe(before);

        tiles.update([request(0), request(2)]);
        await flush();
        expect(tiles.requestCount).toBeGreaterThan(before);
    });

    it('never evicts a tile that is still required, however tight the budget', async () => {
        const net = controllableFetch();
        // A budget below what the required set alone costs. The cache gives up
        // everything and then stops: the required set is never evicted while it
        // is required, and a required set that is over budget is the planner's
        // residency window to answer for, not the LRU's.
        const tiles = scheduler({ maxInFlight: 4, byteBudget: 1 });

        await hold(tiles, net, [0, 1, 2]);

        expect(tiles.residentKeys().size).toBe(3);
        expect(tiles.cachedTileCount).toBe(0);
        expect(tiles.decodedBytes).toBe(3 * TILE_BYTES);
    });

    it('reports the required set’s own bytes, so an unenforceable overrun is visible', async () => {
        // The ceiling bounds the CACHE, and bounds the total only while the
        // required set fits underneath it. Saying "the pixels sit under the byte
        // ceiling" without qualification is therefore an overstatement — a
        // manifest declaring its full-resolution image as each Canvas's
        // `thumbnail` requires fifty full-size decodes at the zoom floor, and
        // that URL must be used as-is. `requiredBytes` is what makes that state
        // diagnosable instead of silent.
        const net = controllableFetch();
        const budget = TILE_BYTES;
        const tiles = scheduler({ maxInFlight: 4, byteBudget: budget });

        await hold(tiles, net, [0, 1, 2]);

        expect(requiredBytes(tiles)).toBe(3 * TILE_BYTES);
        expect(requiredBytes(tiles)).toBeGreaterThan(tiles.byteBudget);
        // Nothing left to shed: the cache is empty and the overrun is entirely
        // the required set's.
        expect(tiles.cachedTileCount).toBe(0);
        expect(requiredBytes(tiles)).toBe(tiles.decodedBytes);
    });

    it('counts only the required set, not the opportunistic cache', async () => {
        const net = controllableFetch();
        const tiles = scheduler({
            maxInFlight: 4,
            byteBudget: 8 * TILE_BYTES,
        });

        await hold(tiles, net, [0, 1]);
        tiles.update([request(0)]);

        expect(tiles.cachedTileCount).toBe(1);
        expect(requiredBytes(tiles)).toBe(TILE_BYTES);
        expect(tiles.decodedBytes).toBe(2 * TILE_BYTES);
    });

    it('stays under the byte budget through sustained scrolling', async () => {
        const net = controllableFetch();
        const budget = 6 * TILE_BYTES;
        const tiles = scheduler({ maxInFlight: 8, byteBudget: budget });

        // Two tiles required at a time, walking forward forty steps — far more
        // than the budget could ever hold, which is the point.
        for (let step = 0; step < 40; step += 1) {
            await hold(tiles, net, [step, step + 1]);
            expect(tiles.decodedBytes).toBeLessThanOrEqual(budget);
        }

        expect(tiles.residentKeys().size).toBe(2);
    });

    it('closes what the budget evicts rather than leaking it outside the JS heap', async () => {
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 4, byteBudget: TILE_BYTES });

        await hold(tiles, net, [0]);
        await hold(tiles, net, [1]);

        // Tile 0 was cached, then pushed out by tile 1 arriving. An
        // `ImageBitmap` dropped without `close()` leaks past both the heap
        // metrics and `decodedBytes`, which is the counter that exists to see
        // exactly this.
        expect(net.closes[0]).toHaveBeenCalled();
        expect(tiles.decodedBytes).toBe(TILE_BYTES);
    });

    it('caches nothing at a zero byte budget: a dropped tile is closed on the spot', async () => {
        // `byteBudget: 0` is the meaningful "no opportunistic cache" setting,
        // and it is load-bearing rather than incidental: every assertion in the
        // describe block above is about the REQUIRED set alone because the
        // scheduler is built with it, and four browser specs turn it off so
        // their tile counts mean what they say. Trim's guard is what makes it
        // true — relax it to `<`, or add a keep-at-least-one heuristic, and
        // every other unit test here still passes while those four specs start
        // failing with nothing naming the cause.
        const net = controllableFetch();
        const tiles = scheduler({ maxInFlight: 4 });

        await hold(tiles, net, [0, 1]);
        expect(tiles.residentKeys().size).toBe(2);

        // Tile 0 leaves the required set. There is no budget to hold it under,
        // so it is closed in this call rather than cached.
        tiles.update([request(1)]);

        expect(tiles.cachedTileCount).toBe(0);
        expect(tiles.residentKeys().size).toBe(1);
        // The required set alone, exactly — nothing held on its behalf.
        expect(tiles.decodedBytes).toBe(TILE_BYTES);
        expect(net.closes[0]).toHaveBeenCalled();
        expect(net.closes[1]).not.toHaveBeenCalled();
    });

    it('closes the cache on dispose', async () => {
        const net = controllableFetch();
        const tiles = scheduler({
            maxInFlight: 4,
            byteBudget: 8 * TILE_BYTES,
        });

        await hold(tiles, net, [0, 1]);
        tiles.update([]);
        expect(tiles.cachedTileCount).toBe(2);

        tiles.dispose();
        expect(tiles.cachedTileCount).toBe(0);
        expect(tiles.decodedBytes).toBe(0);
    });
});
