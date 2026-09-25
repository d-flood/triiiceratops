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
 * refetched `info.json` every time a canvas re-enters the viewport.
 *
 * The cache is therefore module-scoped and page-shared, like the manifest cache,
 * and no viewport pressure drops an entry — only an explicit `invalidate` or
 * `clear`, and the entry ceiling that keeps a long session from growing without
 * bound.
 *
 * ## Failure is not a fact
 *
 * That long lifetime is exactly why a failure recorded here must be
 * discriminating. A `401` is an answer about the service and is permanent; a
 * dropped connection is an answer about the network and is not. Recording both
 * the same way makes one flaky request blank that canvas for the rest of the
 * page's life — across manifests, across SPA navigations — with nothing on
 * screen to say why.
 *
 * ## What it replaces
 *
 * The previous renderer resolved its tile sources by `Promise.all`ing a `fetch`
 * over **every** source before anything rendered — 800 requests for an 800-folio
 * manuscript. Here a canvas fetches its own metadata, once, when the planner
 * says it needs it.
 */

import { logger } from '../logging/logger';
import {
    iiifImageRequestUrl,
    iiifSizeParameter,
} from '../utils/iiifImageRequest';
import { getResourceId } from '../utils/iiifIds';
import { isPositiveFinite } from '../utils/numbers';
import { METADATA_IN_FLIGHT_LIMIT } from './rendererDefaults';
import { isLevel0Profile } from './sizeLadder';
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
    return isPositiveFinite(value) ? Math.floor(value) : null;
}

/**
 * Which major version of the Image API a service document describes.
 *
 * The `@context` is authoritative in both versions; `type: 'ImageService3'` and
 * a `/api/image/3/` profile are the fallbacks for documents that omit it.
 *
 * It deliberately does **not** decide the tile quality parameter. A 2.0 document
 * and a 2.1 one are indistinguishable — same `@context`, same profile URIs — and
 * 2.1 deprecated `native` in favour of `default`, so no answer this function can
 * give would justify asking for `native`. What the version does govern is
 * request size syntax: static version 3 tiles use canonical `w,h`, and the size
 * ladder and thumbnail ladder spell a whole-image request `full` in version 2
 * and `max` in version 3.
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

    const requestBaseUri = firstString(getResourceId(document));
    if (requestBaseUri) facts.requestBaseUri = requestBaseUri;

    // The only thing read off `profile`. Everything else the renderer decides
    // from what the service ADVERTISES, which is right even when a profile is
    // missing or lies — but "may this service be asked for an arbitrary
    // region?" has no advertised form, so the declaration is all there is.
    if (isLevel0Profile(document.profile)) facts.level0 = true;

    const tiles = Array.isArray(document.tiles) ? document.tiles[0] : null;
    if (tiles && typeof tiles === 'object') {
        const entry = tiles as Record<string, unknown>;
        const tileSize = positiveInteger(entry.width);
        if (tileSize) facts.tileSize = tileSize;

        const scaleFactors = Array.isArray(entry.scaleFactors)
            ? entry.scaleFactors.filter(
                  (factor): factor is number =>
                      isPositiveFinite(factor) && factor >= 1,
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

/** A decoded image's real dimensions, or `null` if it would not decode. */
type MeasureImage = (
    url: string,
) => Promise<{ width: number; height: number } | null>;

/**
 * How far two aspect ratios may differ and still describe the same picture.
 * Wide enough for a publisher's own rounding, far narrower than the
 * disagreement a wrong pair of dimensions produces.
 */
const ASPECT_TOLERANCE = 0.01;

function aspectsAgree(one: number, other: number): boolean {
    return Math.abs(one - other) <= ASPECT_TOLERANCE * Math.max(one, other);
}

function measureImage(url: string): ReturnType<MeasureImage> {
    return new Promise((resolve) => {
        // No `crossOrigin`: nothing reads these pixels back, and demanding CORS
        // would fail the probe on the very services it exists to judge.
        const image = new Image();
        image.onload = () =>
            resolve(
                image.naturalWidth > 0 && image.naturalHeight > 0
                    ? { width: image.naturalWidth, height: image.naturalHeight }
                    : null,
            );
        image.onerror = () => resolve(null);
        image.src = url;
    });
}

/**
 * The facts a service can be held to, given what the manifest says the same
 * picture's shape is.
 *
 * A service whose dimensions disagree with its Canvas's is ordinary and
 * harmless for geometry — the manifest wins there permanently. It is not
 * harmless for TILING, which is built from these dimensions: if they are the
 * wrong ones, every region request beyond the real image's extent errors, and
 * the reader sees a canvas that looks right zoomed out and falls apart zoomed
 * in. (Harvard's MPS derives `info.json` from a file's EXIF header rather than
 * its raster, so an asset whose header disagrees advertises a size — and an
 * orientation — it will not serve.)
 *
 * Which side is wrong is measurable rather than a guess: the service's own
 * whole-image request returns the pixels it really holds, and whichever
 * declared aspect matches that raster is the truthful one. Only `declared`'s
 * RATIO is read, never its units: a placement box is normalized to the canvas's
 * width, so it carries the manifest's shape but not its pixel count. So the probe runs
 * only once the two already disagree — no request at all on a healthy manifest
 * — and convicts the service only when the raster sides with the manifest.
 *
 * Only the raster's ASPECT is evidence. A whole-image request may be capped by
 * the service's `maxWidth`, so its absolute size proves nothing about the
 * declared one and is never compared to it.
 *
 * The repair keeps only what a lying service can still be asked for: `sizes`,
 * tiling, and scale factors all describe an extent it does not honour, so they
 * are dropped rather than corrected, and `width`/`height` become the measured
 * raster — the right aspect for the reflow, and the true extent of the one
 * request left.
 */
async function verifyDimensions(
    facts: ImageServiceFacts,
    serviceId: string,
    declared: { width: number; height: number } | undefined,
): Promise<ImageServiceFacts> {
    if (!declared) return facts;

    const serviceAspect = facts.width / facts.height;
    const declaredAspect = declared.width / declared.height;
    if (aspectsAgree(serviceAspect, declaredAspect)) return facts;

    const measured = await measureImage(
        iiifImageRequestUrl(
            facts.requestBaseUri ?? serviceId,
            iiifSizeParameter(facts.width, true, facts.version === 2 ? 2 : 3),
            'default',
            facts.format || 'jpg',
        ),
    );

    // The verdict is composed before it is acted on so the three outcomes
    // share one message: every byte of English here ships.
    const convicted =
        measured !== null &&
        !aspectsAgree(measured.width / measured.height, serviceAspect);

    logger.warn(
        `${serviceId}: aspect ${serviceAspect.toFixed(3)} in info.json ` +
            `(${facts.width}x${facts.height}), ` +
            `${declaredAspect.toFixed(3)} in the manifest, ` +
            `${measured ? `${measured.width}x${measured.height} served` : 'nothing served'}` +
            // Unmeasurable: the disagreement is real but unattributable, and
            // the declared facts are the only ones there are.
            (!measured
                ? ' — undecidable'
                : convicted
                  ? ' — info.json wrong, whole images only'
                  : ' — manifest wrong, tiling survives'),
    );

    if (!measured || !convicted) return facts;

    const repaired: ImageServiceFacts = {
        width: measured.width,
        height: measured.height,
        regionsUntrusted: true,
    };
    if (facts.requestBaseUri) repaired.requestBaseUri = facts.requestBaseUri;
    if (facts.version) repaired.version = facts.version;
    if (facts.format) repaired.format = facts.format;
    if (facts.level0) repaired.level0 = true;
    return repaired;
}

/** Why a service has no facts, when it has none. */
export type ImageServiceFailure = 'auth' | 'load';

export interface ImageServiceCache {
    /** Facts already held, without starting a fetch. */
    get(serviceId: string): ImageServiceFacts | undefined;
    /**
     * Why this service has no facts, if it has none.
     *
     * The seam the host announces a canvas's error state through: a canvas
     * whose `info.json` never arrived paints nothing, and a viewer that says
     * nothing about it is indistinguishable from one that is still loading.
     */
    failure(serviceId: string): ImageServiceFailure | undefined;
    /**
     * Whether this service's failure is **spent** — an answer rather than an
     * attempt.
     *
     * {@link failure} reports the kind as soon as one attempt has failed, which
     * for a retryable failure is a claim the next `ensure` may withdraw. A host
     * that showed an error placeholder on that would flash one on every 503 and
     * take it away again a frame later. This is the query that says the question
     * is closed: the failure is deterministic, or its attempt allowance is gone
     * and nothing will ask again before the next mount.
     */
    spent(serviceId: string): boolean;
    /**
     * Facts for a service, fetching `info.json` at most once per attempt
     * allowance.
     *
     * Safe to call every frame: a hit resolves from cache, a miss joins the
     * in-flight request rather than starting a second one, and a service that
     * has spent its attempts resolves `null` without touching the network.
     *
     * Also safe to call for fifty services at once: at most
     * `rendererDefaults.METADATA_IN_FLIGHT_LIMIT` requests are outstanding
     * and the rest wait their turn, so the promise a caller gets back may be
     * queued rather than in flight. The planner emits its list centre-out and
     * re-emits it every frame, so the queue drains in the order the reader
     * cares about.
     *
     * `declared` is what the manifest says the shape of the picture this
     * service paints is — the only thing that can contradict an `info.json`
     * (see {@link verifyDimensions}). Omitted where the manifest never said,
     * and read only from the caller that starts the request: a second caller
     * joining one in flight has the same service and therefore the same answer.
     */
    ensure(
        serviceId: string,
        declared?: { width: number; height: number },
    ): Promise<ImageServiceFacts | null>;
    /**
     * Forget every failure that was **not** deterministic, keeping the facts.
     *
     * Called by the host on mount. A dropped connection, a captive portal, or a
     * 500 says nothing about the service, so a viewer that recorded one
     * permanently would paint that canvas blank for the rest of the page's life
     * — across manifests and across SPA navigations, since this cache outlives
     * all of them. Only `auth` and an unparseable document are permanent: those
     * are answers, and repeating the question cannot change them.
     */
    retryTransientFailures(): void;
}

/**
 * How many times a transient failure may be attempted before the service is
 * left alone until the next mount. Two is one retry, matching the tile
 * scheduler's allowance.
 */
const MAX_ATTEMPTS = 2;

/**
 * Entry ceiling for the facts held.
 *
 * The cache is page-shared and never expires, so an unbounded map grows with
 * every canvas of every manifest a session ever opens. Oldest-first, which
 * for metadata is as good as recency and costs no bookkeeping.
 */
const MAX_ENTRIES = 512;

async function fetchInfoJson(
    url: string,
): Promise<{ status: number; json: unknown }> {
    const response = await fetch(url);
    if (!response.ok) return { status: response.status, json: null };
    return { status: response.status, json: await response.json() };
}

/**
 * A recorded failure.
 *
 * `permanent` is the whole point: only a deterministic answer — the service said
 * no, or said something unparseable — closes the question. Everything else is
 * the network, and the network changes.
 */
interface FailureEntry {
    kind: ImageServiceFailure;
    permanent: boolean;
    attempts: number;
}

export function createImageServiceCache(): ImageServiceCache {
    const facts = new Map<string, ImageServiceFacts>();
    const failures = new Map<string, FailureEntry>();
    /**
     * Wanted and not yet answered — queued OR actually fetching. Callers join
     * it either way, which is what lets the window be bounded without a second
     * request escaping through a frame that arrived while a slot was busy.
     */
    const inFlight = new Map<string, Promise<ImageServiceFacts | null>>();
    /** Admitted to the window but not started, oldest first. */
    const waiting: Array<{
        serviceId: string;
        declared?: { width: number; height: number };
        settle: (facts: ImageServiceFacts | null) => void;
    }> = [];
    let active = 0;

    /** Insertion-ordered, so the oldest key is simply the first one. */
    function bound<Value>(map: Map<string, Value>): void {
        while (map.size > MAX_ENTRIES) {
            const oldest = map.keys().next();
            if (oldest.done) return;
            map.delete(oldest.value);
        }
    }

    function fail(
        serviceId: string,
        kind: ImageServiceFailure,
        permanent: boolean,
    ): null {
        const attempts = (failures.get(serviceId)?.attempts ?? 0) + 1;
        failures.set(serviceId, { kind, permanent, attempts });
        bound(failures);
        return null;
    }

    async function load(
        serviceId: string,
        declared: { width: number; height: number } | undefined,
    ): Promise<ImageServiceFacts | null> {
        try {
            const { status, json } = await fetchInfoJson(
                `${serviceId}/info.json`,
            );
            // The authentication/load distinction is preserved from the
            // previous renderer: knowing whether logging in would help is the
            // difference between a useful error and a shrug. It is also an
            // answer, so it is permanent — logging in is a new page, and a new
            // page is a new cache.
            if (status === 401 || status === 403) {
                return fail(serviceId, 'auth', true);
            }

            // A 5xx, a captive portal's redirect, a proxy's error page: the
            // server is not describing this service, it is failing to. Retryable.
            if (status >= 400) {
                return fail(serviceId, 'load', false);
            }

            const parsed = parseImageService(json);
            // The document arrived and is not an image service. Asking again
            // gets the same document.
            if (!parsed) return fail(serviceId, 'load', true);

            // Inside the slot deliberately: the probe's own request is then
            // under the same concurrency cap as the document's, and a manifest
            // of broken services cannot outrun it.
            const verified = await verifyDimensions(
                parsed,
                serviceId,
                declared,
            );

            failures.delete(serviceId);
            facts.set(serviceId, verified);
            bound(facts);
            return verified;
        } catch {
            // A thrown fetch is a dropped connection or a CORS rejection —
            // never an answer about the service.
            return fail(serviceId, 'load', false);
        } finally {
            inFlight.delete(serviceId);
        }
    }

    /**
     * Start as many waiting services as the window has room for.
     *
     * `load` never rejects — every failure mode is already an answer it records
     * — so a settled slot is always freed and the queue cannot stall on one bad
     * service.
     */
    function pump(): void {
        while (active < METADATA_IN_FLIGHT_LIMIT && waiting.length > 0) {
            const next = waiting.shift()!;
            active += 1;
            void load(next.serviceId, next.declared).then((result) => {
                active -= 1;
                next.settle(result);
                pump();
            });
        }
    }

    /**
     * Spent, not necessarily settled: a transient failure stops being asked for
     * once its attempts are gone, so a frame loop cannot turn an outage into a
     * request storm, and `retryTransientFailures` reopens it on the next mount.
     *
     * One predicate for `ensure` and for `spent`, deliberately: "this service
     * will not be asked again" and "a host may say this canvas failed" have to
     * be the same condition, or a placeholder outlives a retry or precedes one.
     */
    function isSpent(serviceId: string): boolean {
        const failed = failures.get(serviceId);
        if (!failed) return false;
        return failed.permanent || failed.attempts >= MAX_ATTEMPTS;
    }

    return {
        get: (serviceId) => facts.get(serviceId),
        failure: (serviceId) => failures.get(serviceId)?.kind,
        spent: isSpent,
        ensure(serviceId, declared) {
            const known = facts.get(serviceId);
            if (known) return Promise.resolve(known);

            if (isSpent(serviceId)) return Promise.resolve(null);

            const pending = inFlight.get(serviceId);
            if (pending) return pending;

            const queued = new Promise<ImageServiceFacts | null>((resolve) => {
                waiting.push({
                    serviceId,
                    ...(declared ? { declared } : {}),
                    settle: resolve,
                });
            });
            inFlight.set(serviceId, queued);
            pump();
            return queued;
        },
        retryTransientFailures() {
            for (const [serviceId, entry] of [...failures]) {
                if (!entry.permanent) failures.delete(serviceId);
            }
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
