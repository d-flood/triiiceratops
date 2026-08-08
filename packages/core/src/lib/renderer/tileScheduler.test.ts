// @vitest-environment node
/**
 * The tile scheduler, against a fake fetch.
 *
 * Ordering, the in-flight window, the cancellation policy, and the negative
 * cache are decisions over planner output, so they are asserted here rather
 * than in a browser (ticket 05 §Acceptance criteria). Node environment: nothing
 * in this graph may reach for a DOM global, and both the fetch and the decode
 * are seams precisely so this file needs neither.
 */

import { describe, expect, it, vi } from 'vitest';

import { createTileScheduler, type DecodedTile } from './tileScheduler';
import type { TileRequest } from './types';

interface Pending {
    url: string;
    signal: AbortSignal;
    resolve(): void;
    reject(error?: unknown): void;
}

/**
 * A fetch that hands back control: every request stays pending until the test
 * settles it by hand, which is the only way to observe a *window* rather than a
 * sequence.
 */
function controllableFetch() {
    const pending: Pending[] = [];

    const fetchTile = (url: string, signal: AbortSignal) =>
        new Promise<Blob>((resolve, reject) => {
            const entry: Pending = {
                url,
                signal,
                resolve: () => resolve({ size: 1 } as Blob),
                reject: (error) => reject(error ?? new Error('failed')),
            };
            pending.push(entry);
            signal.addEventListener('abort', () =>
                reject(new Error('aborted')),
            );
        });

    return {
        fetchTile,
        pending,
        byUrl: (url: string) => pending.filter((entry) => entry.url === url),
        settleAll() {
            for (const entry of [...pending]) entry.resolve();
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

    const decodeTile = () =>
        new Promise<DecodedTile>((resolve) => {
            const close = vi.fn();
            pending.push({
                close,
                settle: () => resolve({ width: 4, height: 4, close }),
            });
        });

    return { decodeTile, pending };
}

let decodedTiles = 0;

function decodeTile(): Promise<DecodedTile> {
    decodedTiles += 1;
    return Promise.resolve({
        width: 10,
        height: 20,
        close: vi.fn(),
    });
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
    net: ReturnType<typeof controllableFetch>,
    options: { maxInFlight?: number; maxAttempts?: number } = {},
) {
    return createTileScheduler({
        maxInFlight: options.maxInFlight ?? 2,
        maxAttempts: options.maxAttempts ?? 2,
        fetchTile: net.fetchTile,
        decodeTile,
    });
}

describe('createTileScheduler', () => {
    it('never exceeds the in-flight window', async () => {
        const net = controllableFetch();
        const tiles = scheduler(net, { maxInFlight: 3 });

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
        const tiles = scheduler(net, { maxInFlight: 2 });

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
        const tiles = scheduler(net, { maxInFlight: 2 });

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

    it('does not restart a request that is already in flight for the same tile', async () => {
        const net = controllableFetch();
        const tiles = scheduler(net, { maxInFlight: 4 });

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
        const tiles = scheduler(net, { maxInFlight: 2 });

        tiles.update([request(0)]);
        await flush();

        // Superseded after the fetch resolved but before the decode landed:
        // caching it here is how a fast zoom fills memory with pixels nobody
        // asked for.
        const before = decodedTiles;
        net.pending[0].resolve();
        tiles.update([request(5)]);
        await flush();

        expect(decodedTiles).toBeGreaterThan(before);
        expect(tiles.get(request(0).key)).toBeUndefined();
        expect(tiles.residentTileCount).toBe(0);
    });

    it('holds a tile that is still required when its decode lands', async () => {
        const net = controllableFetch();
        const tiles = scheduler(net, { maxInFlight: 2 });

        tiles.update([request(0)]);
        await flush();
        net.pending[0].resolve();
        await flush();

        expect(tiles.get(request(0).key)).toBeDefined();
        expect(tiles.residentKeys().has(request(0).key)).toBe(true);
    });

    it('reports resident tiles and decoded bytes, and they follow what is held', async () => {
        const net = controllableFetch();
        const tiles = scheduler(net, { maxInFlight: 4 });

        tiles.update([request(0), request(1)]);
        await flush();
        net.settleAll();
        await flush();

        expect(tiles.residentTileCount).toBe(2);
        // 10x20 at 4 bytes per pixel, twice.
        expect(tiles.decodedBytes).toBe(2 * 10 * 20 * 4);

        // Releasing what is no longer required takes its bytes with it —
        // browser heap metrics could not see this, because decoded images live
        // outside the JS heap.
        tiles.update([request(0)]);
        expect(tiles.residentTileCount).toBe(1);
        expect(tiles.decodedBytes).toBe(10 * 20 * 4);
    });

    it('closes a released tile rather than leaking it outside the JS heap', async () => {
        const net = controllableFetch();
        const closes: Array<() => void> = [];
        const tiles = createTileScheduler({
            maxInFlight: 2,
            maxAttempts: 2,
            fetchTile: net.fetchTile,
            decodeTile: () => {
                const close = vi.fn();
                closes.push(close);
                return Promise.resolve({ width: 4, height: 4, close });
            },
        });

        tiles.update([request(0)]);
        await flush();
        net.settleAll();
        await flush();

        tiles.update([]);
        expect(closes[0]).toHaveBeenCalled();
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
        const tiles = createTileScheduler({
            maxInFlight: 4,
            maxAttempts: 2,
            fetchTile: net.fetchTile,
            decodeTile: decodes.decodeTile,
        });
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

        expect(tiles.residentTileCount).toBe(1);
        expect(tiles.decodedBytes).toBe(4 * 4 * 4);
        expect(decodes.pending[1].close).not.toHaveBeenCalled();
    });

    it('retries a failed tile once, then never asks for that URL again', async () => {
        const net = controllableFetch();
        const tiles = scheduler(net, { maxInFlight: 2, maxAttempts: 2 });
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

    it('does not count an abort as a failure', async () => {
        const net = controllableFetch();
        const tiles = scheduler(net, { maxInFlight: 2, maxAttempts: 2 });
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
        const tiles = createTileScheduler({
            maxInFlight: 2,
            maxAttempts: 2,
            fetchTile: net.fetchTile,
            decodeTile,
            onChange,
        });

        tiles.update([request(0)]);
        await flush();
        expect(onChange).not.toHaveBeenCalled();

        net.settleAll();
        await flush();
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('aborts everything and releases every tile on dispose', async () => {
        const net = controllableFetch();
        const tiles = scheduler(net, { maxInFlight: 2 });

        tiles.update([request(0), request(1), request(2)]);
        await flush();
        net.pending[0].resolve();
        await flush();

        tiles.dispose();

        expect(tiles.residentTileCount).toBe(0);
        expect(tiles.decodedBytes).toBe(0);
        expect(net.pending.some((entry) => entry.signal.aborted)).toBe(true);

        // And it stays inert: a late frame must not start new work.
        tiles.update([request(9)]);
        await flush();
        expect(net.byUrl('https://images.test/abc/tile-9.jpg')).toHaveLength(0);
    });
});
