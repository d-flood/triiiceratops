/**
 * Image-service metadata: parsing `info.json`, and the cache that holds it.
 *
 * ## Two caches, two lifetimes
 *
 * This is deliberately **not** the same cache as the decoded tiles (see
 * `tileScheduler.ts`). Metadata is a few hundred bytes describing a service,
 * and it stays valid for as long as the page is open; decoded pixels are
 * megabytes and are evicted under viewport pressure. Conflating them into one
 * cache with one eviction policy is the default mistake, and it shows up as a
 * refetched `info.json` every time a canvas re-enters the viewport
 * (spec §Virtualization: per-canvas level residency).
 *
 * The cache is therefore module-scoped and page-shared, like the manifest
 * cache, and its entries are never dropped by anything the renderer does.
 *
 * ## What it replaces
 *
 * `components/osdTileSources.resolveTileSources` `Promise.all`s a `fetch` over
 * **every** source before anything renders — 800 requests for an 800-folio
 * manuscript. Here a canvas fetches its own metadata, once, when the planner
 * says it needs it. That module stays until ticket 18, because the
 * OpenSeadragon path still uses it.
 */

import type { ImageServiceFacts } from './types';

function firstString(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        for (const entry of value) {
            if (typeof entry === 'string') return entry;
        }
    }
    return null;
}

function positiveInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : null;
}

/**
 * Which major version of the Image API a service document describes.
 *
 * The `@context` is authoritative in both versions; `type: 'ImageService3'` and
 * a `/api/image/3/` profile are the fallbacks for documents that omit it. The
 * answer decides one thing only — whether a tile URL asks for `default` or
 * `native` quality.
 */
function parseVersion(json: Record<string, unknown>): 2 | 3 {
    const context = firstString(json['@context']) ?? '';
    if (context.includes('/image/3/')) return 3;
    if (context.includes('/image/2/')) return 2;

    if (json.type === 'ImageService3') return 3;
    if (json['@type'] === 'iiif:Image') return 2;

    const profile = firstString(json.profile) ?? '';
    if (profile.includes('/image/2/')) return 2;

    return 3;
}

/**
 * `info.json` → the facts the renderer acts on, or `null` if it is not a usable
 * image service document.
 *
 * Everything not listed in `ImageServiceFacts` is deliberately dropped: the
 * renderer's contract is plain data, and carrying the raw document forward
 * would invite reaching into it from places that should be taking a parameter.
 */
export function parseImageService(json: unknown): ImageServiceFacts | null {
    if (!json || typeof json !== 'object') return null;
    const document = json as Record<string, unknown>;

    const width = positiveInteger(document.width);
    const height = positiveInteger(document.height);
    if (!width || !height) return null;

    const facts: ImageServiceFacts = {
        width,
        height,
        version: parseVersion(document),
    };

    const tiles = Array.isArray(document.tiles) ? document.tiles[0] : null;
    if (tiles && typeof tiles === 'object') {
        const entry = tiles as Record<string, unknown>;
        const tileSize = positiveInteger(entry.width);
        if (tileSize) facts.tileSize = tileSize;

        const scaleFactors = Array.isArray(entry.scaleFactors)
            ? entry.scaleFactors.filter(
                  (factor): factor is number =>
                      typeof factor === 'number' &&
                      Number.isFinite(factor) &&
                      factor >= 1,
              )
            : [];
        if (scaleFactors.length > 0) facts.scaleFactors = scaleFactors;
    }

    if (Array.isArray(document.sizes)) {
        const sizes = document.sizes
            .map((size) => {
                if (!size || typeof size !== 'object') return null;
                const entry = size as Record<string, unknown>;
                const sizeWidth = positiveInteger(entry.width);
                const sizeHeight = positiveInteger(entry.height);
                return sizeWidth && sizeHeight
                    ? { width: sizeWidth, height: sizeHeight }
                    : null;
            })
            .filter((size): size is { width: number; height: number } =>
                Boolean(size),
            );
        if (sizes.length > 0) facts.sizes = sizes;
    }

    const preferred = Array.isArray(document.preferredFormats)
        ? firstString(document.preferredFormats)
        : null;
    if (preferred) facts.format = preferred;

    return facts;
}

/** Why a service has no facts, when it has none. */
export type ImageServiceFailure = 'auth' | 'load';

export interface ImageServiceCache {
    /** Facts already held, without starting a fetch. */
    get(serviceId: string): ImageServiceFacts | undefined;
    /** Why this service failed, if it did. Permanent: it is never retried. */
    failure(serviceId: string): ImageServiceFailure | undefined;
    /**
     * Facts for a service, fetching `info.json` at most once ever.
     *
     * Safe to call every frame: a hit resolves from cache, a miss joins the
     * in-flight request rather than starting a second one, and a permanent
     * failure resolves `null` without touching the network.
     */
    ensure(serviceId: string): Promise<ImageServiceFacts | null>;
    /** How many network requests this cache has issued. Test/diagnostic only. */
    readonly requestCount: number;
}

export interface ImageServiceCacheOptions {
    /**
     * Seam for tests. The default reaches for the global `fetch` **lazily**, at
     * call time, so this module stays importable in plain Node with no DOM and
     * no fetch polyfill at module scope.
     */
    fetchJson?: (url: string) => Promise<{ status: number; json: unknown }>;
}

async function defaultFetchJson(
    url: string,
): Promise<{ status: number; json: unknown }> {
    const response = await fetch(url);
    if (!response.ok) return { status: response.status, json: null };
    return { status: response.status, json: await response.json() };
}

export function createImageServiceCache(
    options: ImageServiceCacheOptions = {},
): ImageServiceCache {
    const fetchJson = options.fetchJson ?? defaultFetchJson;

    const facts = new Map<string, ImageServiceFacts>();
    const failures = new Map<string, ImageServiceFailure>();
    const inFlight = new Map<string, Promise<ImageServiceFacts | null>>();
    let requestCount = 0;

    async function load(serviceId: string): Promise<ImageServiceFacts | null> {
        requestCount += 1;
        try {
            const { status, json } = await fetchJson(`${serviceId}/info.json`);
            // The authentication/load distinction is preserved from the
            // OpenSeadragon path: knowing whether logging in would help is the
            // difference between a useful error and a shrug (user story 27).
            if (status === 401 || status === 403) {
                failures.set(serviceId, 'auth');
                return null;
            }

            const parsed = parseImageService(json);
            if (!parsed) {
                failures.set(serviceId, 'load');
                return null;
            }

            facts.set(serviceId, parsed);
            return parsed;
        } catch {
            failures.set(serviceId, 'load');
            return null;
        } finally {
            inFlight.delete(serviceId);
        }
    }

    return {
        get: (serviceId) => facts.get(serviceId),
        failure: (serviceId) => failures.get(serviceId),
        ensure(serviceId) {
            const known = facts.get(serviceId);
            if (known) return Promise.resolve(known);
            if (failures.has(serviceId)) return Promise.resolve(null);

            const pending = inFlight.get(serviceId);
            if (pending) return pending;

            const started = load(serviceId);
            inFlight.set(serviceId, started);
            return started;
        },
        get requestCount() {
            return requestCount;
        },
    };
}

/**
 * The page-shared metadata cache.
 *
 * Module-scoped on purpose — this is the lifetime that makes re-entering a
 * canvas free. Creating one per renderer instance would refetch every
 * `info.json` on remount.
 */
export const imageServiceCache: ImageServiceCache = createImageServiceCache();
