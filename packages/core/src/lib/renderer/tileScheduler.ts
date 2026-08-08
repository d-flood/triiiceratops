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
 * ## The one alternate spelling
 *
 * A request may carry a `fallback`: a second URL for the same pixels, and the
 * group the answer holds for. It exists for the version 2 `default`/`native`
 * quality deviation (`sizeLadder`), where the renderer's answer is right for
 * every modern endpoint and wrong for a frozen static tree — and where, for a
 * **size-ladder source**, being wrong means every rung 404s and the canvas is
 * blank for the life of the page rather than merely blurrier.
 *
 * It is spent, not free: the retry a failed request already gets is redirected
 * to the fallback rather than added to, so the attempt budget is unchanged; and
 * a fallback that works is remembered for its group, so the rest of that
 * service goes straight to the working spelling. The failure counter and the
 * negative cache stay keyed on the request's ORIGINAL url, so one tile is one
 * entry however it was spelled.
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
    /**
     * A request's ORIGINAL url → consecutive real failures. Aborts are not
     * failures. Keyed on the original rather than on whatever spelling was
     * actually fetched, so a request with a `fallback` still gets one attempt
     * budget rather than one per spelling.
     */
    const failures = new Map<string, number>();
    /** The negative cache: URLs that will never be requested again. */
    const dead = new Set<string>();
    /**
     * Fallback groups whose alternate spelling is known to be the working one.
     * A group joins on the first fallback that succeeds, so the rest of that
     * service skips the spelling already proven wrong.
     */
    const fallbackGroups = new Set<string>();

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

        // The alternate spelling is used on the retry of a request that has
        // already failed once, and immediately for a group whose alternate is
        // known to work. A first attempt on a fresh group is always the
        // canonical url — the fallback costs one wasted request per broken
        // service, and nothing at all for a service that is not broken.
        const fallback =
            request.fallback &&
            ((failures.get(request.url) ?? 0) > 0 ||
                fallbackGroups.has(request.fallback.group))
                ? request.fallback
                : null;
        const url = fallback ? fallback.url : request.url;

        /**
         * Retire THIS attempt, and only if it is still the current one.
         *
         * Aborting cannot cancel a `createImageBitmap` that has already started,
         * so a superseded attempt can settle after the same tile has been
         * re-required and restarted. Keyed by tile alone, its late arrival would
         * delete the *new* attempt's controller: that request becomes
         * untrackable and unabortable, `inFlight.size` undercounts so the window
         * opens past its limit, and the tile is re-queued every frame because
         * nothing records it as in flight.
         */
        function retire(): void {
            if (inFlight.get(request.key) === controller) {
                inFlight.delete(request.key);
            }
        }

        void (async () => {
            try {
                const blob = await fetchTile(url, controller.signal);
                const tile = await decodeTile(blob);

                retire();

                // Re-checked AFTER the decode resolved, not before the fetch
                // started: a tile can leave the viewport during a decode, and
                // caching it then is how a fast zoom fills memory with pixels
                // nobody asked for.
                //
                // Three ways to be unwanted, ONE way out. Every decoded tile
                // this scheduler does not go on to hold is closed on this line:
                // an `ImageBitmap`'s pixels live outside the JS heap, so a
                // dropped reference leaks past the heap metrics AND past
                // `decodedBytes`, the counter that exists to catch exactly that.
                // Written as a single close so no future branch can be added
                // without one.
                const unwanted =
                    controller.signal.aborted ||
                    !required.has(request.key) ||
                    // A superseded attempt whose decode landed behind the one
                    // that won: aborting cannot cancel a `createImageBitmap`
                    // already under way.
                    resident.has(request.key);

                if (unwanted) {
                    tile.close();
                } else {
                    const bytes = decodedBytesOf(tile);
                    resident.set(request.key, { tile, bytes });
                    decodedBytes += bytes;
                    failures.delete(request.url);
                    // Recorded only on a fallback that actually served pixels,
                    // which is what makes it one wasted request for the whole
                    // service instead of one per tile.
                    if (fallback) fallbackGroups.add(fallback.group);
                    options.onChange?.();
                }
            } catch {
                retire();

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
