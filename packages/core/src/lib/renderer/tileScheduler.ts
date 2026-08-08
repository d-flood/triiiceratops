/**
 * The tile scheduler: how tiles are asked for, decoded, held, and released.
 *
 * Scheduling *is* the perceived performance of a deep-zoom viewer. Rasterizing
 * was never the bottleneck — network scheduling and image decode are, and the
 * OpenSeadragon path this replaces asks for at most one new tile per animation
 * frame while capping concurrency not at all: slow to ask, then all at once.
 *
 * The scheduler makes no scene decisions. It is handed the **required set** by
 * `planScene` once per frame and does exactly what that list says. Five rules,
 * each of which the naive implementation gets wrong (ticket 05 §Contract):
 *
 * 1. **Abort on supersede.** Every request carries an `AbortSignal`, and a tile
 *    that leaves the required set is aborted immediately. During a zoom far more
 *    requests are generated than consumed, and uncancelled ones saturate the
 *    connection pool ahead of the tiles actually wanted.
 * 2. **Priority queue, not FIFO.** A bounded in-flight window fed from a queue
 *    ordered by distance from the viewport centre, re-sorted every update as the
 *    viewport moves.
 * 3. **Off-thread decode**, with visibility re-checked *after* the decode
 *    resolves — a tile that left the viewport during decode is closed, not
 *    cached.
 * 4. **Coalesce per frame.** `update` is called once per animation frame, never
 *    per pointer event: pointer events outpace frames during a drag.
 * 5. **Negative cache.** A failed tile gets one retry, then a permanent entry
 *    for that URL. Without it a 404 tile is re-requested every frame it is
 *    visible.
 *
 * ## Counters
 *
 * Resident tile count and total decoded bytes are exposed as a first-class
 * feature, not a test retrofit. Browser heap metrics cannot serve as the memory
 * gate: decoded images live outside the JS heap, so a heap ceiling reads
 * near-flat while tiles leak.
 *
 * ## Not here
 *
 * The **opportunistic cache** — the byte-budgeted LRU holding what was recently
 * dropped from the required set — is ticket 08. Until then a tile absent from
 * the required set is released immediately, which keeps the counters an honest
 * report of residency rather than of history.
 */

import type { TileKey, TileRequest } from './types';

/**
 * A decoded tile. Structurally `ImageBitmap`, which is what `createImageBitmap`
 * produces and what `drawImage` takes — stated structurally so a test can
 * supply one without a browser.
 */
export interface DecodedTile {
    readonly width: number;
    readonly height: number;
    /**
     * Required, not optional: releasing a tile must always be possible. An
     * `ImageBitmap`'s pixels live outside the JS heap, so dropping the last
     * reference does not free them promptly — this is the only way to.
     */
    close(): void;
}

export interface TileSchedulerOptions {
    /**
     * The bounded in-flight window. Six is the spec's starting point and is
     * supplied by the caller precisely so it can be tuned without restructuring.
     */
    maxInFlight: number;
    /**
     * How many times a URL may fail before it is permanently dead. Two is one
     * retry.
     */
    maxAttempts: number;
    /** Called when the resident set changed, i.e. when a repaint is worthwhile. */
    onChange?: () => void;
    /** Seams for tests; both reach for browser globals lazily, at call time. */
    fetchTile?: (url: string, signal: AbortSignal) => Promise<Blob>;
    decodeTile?: (blob: Blob) => Promise<DecodedTile>;
}

export interface TileScheduler {
    /**
     * Reconcile against the required set: abort what left it, release what is
     * no longer required, queue what is missing, and pump the window.
     */
    update(requests: readonly TileRequest[]): void;
    /** The decoded tile for a key, if it is resident. */
    get(key: TileKey): DecodedTile | undefined;
    /** Which tiles are resident — the planner's `residentTiles` input. */
    residentKeys(): ReadonlySet<TileKey>;
    readonly residentTileCount: number;
    /** Total decoded bytes held, at 4 bytes per pixel. */
    readonly decodedBytes: number;
    /** Requests started, including retries. Test/diagnostic only. */
    readonly requestCount: number;
    dispose(): void;
}

async function defaultFetchTile(
    url: string,
    signal: AbortSignal,
): Promise<Blob> {
    const response = await fetch(url, { signal });
    if (!response.ok) {
        throw new Error(`tile request failed: ${response.status}`);
    }
    return response.blob();
}

function defaultDecodeTile(blob: Blob): Promise<DecodedTile> {
    // Off the main thread: `createImageBitmap` decodes on a browser-owned
    // thread, unlike an `<img>` whose decode competes with the frame loop.
    return createImageBitmap(blob);
}

/** 4 bytes per pixel: decoded RGBA, which is what a tile actually costs. */
function decodedBytesOf(tile: DecodedTile): number {
    return tile.width * tile.height * 4;
}

export function createTileScheduler(
    options: TileSchedulerOptions,
): TileScheduler {
    const fetchTile = options.fetchTile ?? defaultFetchTile;
    const decodeTile = options.decodeTile ?? defaultDecodeTile;
    const maxInFlight = Math.max(1, Math.floor(options.maxInFlight));
    const maxAttempts = Math.max(1, Math.floor(options.maxAttempts));

    /** The required set, as of the last `update`. */
    let required = new Map<TileKey, TileRequest>();
    const resident = new Map<TileKey, { tile: DecodedTile; bytes: number }>();
    const inFlight = new Map<TileKey, AbortController>();
    /** Wanted, not yet started. Rebuilt every update, so it re-sorts for free. */
    let queued: TileRequest[] = [];
    /** URL → consecutive real failures. Aborts are not failures. */
    const failures = new Map<string, number>();
    /** The negative cache: URLs that will never be requested again. */
    const dead = new Set<string>();

    let decodedBytes = 0;
    let requestCount = 0;
    let disposed = false;

    function release(key: TileKey): void {
        const entry = resident.get(key);
        if (!entry) return;
        resident.delete(key);
        decodedBytes -= entry.bytes;
        entry.tile.close();
    }

    function pump(): void {
        if (disposed) return;

        while (inFlight.size < maxInFlight && queued.length > 0) {
            start(queued.shift()!);
        }
    }

    function start(request: TileRequest): void {
        const controller = new AbortController();
        inFlight.set(request.key, controller);
        requestCount += 1;

        void (async () => {
            try {
                const blob = await fetchTile(request.url, controller.signal);
                const tile = await decodeTile(blob);

                inFlight.delete(request.key);

                // Re-checked AFTER the decode resolved, not before the fetch
                // started: a tile can leave the viewport during a decode, and
                // caching it then is how a fast zoom fills memory with pixels
                // nobody asked for.
                if (controller.signal.aborted || !required.has(request.key)) {
                    tile.close();
                } else if (!resident.has(request.key)) {
                    const bytes = decodedBytesOf(tile);
                    resident.set(request.key, { tile, bytes });
                    decodedBytes += bytes;
                    failures.delete(request.url);
                    options.onChange?.();
                }
            } catch {
                inFlight.delete(request.key);

                // An abort is not a failure. Counting it would let a fast pan
                // — which aborts by design — poison the negative cache with
                // tiles that were never actually broken.
                if (!controller.signal.aborted) {
                    const count = (failures.get(request.url) ?? 0) + 1;
                    failures.set(request.url, count);
                    if (count >= maxAttempts) {
                        dead.add(request.url);
                    } else if (required.has(request.key)) {
                        queued.push(request);
                    }
                }
            }

            pump();
        })();
    }

    return {
        update(requests) {
            if (disposed) return;

            required = new Map(
                requests.map((request) => [request.key, request]),
            );

            for (const [key, controller] of inFlight) {
                if (required.has(key)) continue;
                controller.abort();
                inFlight.delete(key);
            }

            for (const key of [...resident.keys()]) {
                if (!required.has(key)) release(key);
            }

            // Rebuilt and re-sorted rather than patched: every tile's distance
            // from the viewport centre changes when the viewport moves, so a
            // queue that kept its old order would be answering the question the
            // user asked two seconds ago. Sorted here rather than trusted from
            // the caller, so the window's ordering is this module's guarantee.
            queued = requests
                .filter(
                    (request) =>
                        !resident.has(request.key) &&
                        !inFlight.has(request.key) &&
                        !dead.has(request.url),
                )
                .sort((a, b) => a.priority - b.priority);

            pump();
        },
        get: (key) => resident.get(key)?.tile,
        residentKeys: () => new Set(resident.keys()),
        get residentTileCount() {
            return resident.size;
        },
        get decodedBytes() {
            return decodedBytes;
        },
        get requestCount() {
            return requestCount;
        },
        dispose() {
            disposed = true;
            for (const controller of inFlight.values()) controller.abort();
            inFlight.clear();
            queued = [];
            required = new Map();
            for (const key of [...resident.keys()]) release(key);
        },
    };
}
