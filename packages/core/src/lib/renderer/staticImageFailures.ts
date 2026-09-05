/**
 * The negative cache for **static image** URLs: which plain `<img>` sources have
 * already failed, so a canvas that failed is not refetched every time it
 * re-enters the viewport (spec §Errors).
 *
 * ## Why this exists as its own module-level cache
 *
 * A service-backed canvas gets this property for free from `imageService`'s
 * cache: metadata is held page-shared with a longer lifetime than decoded
 * pixels, so re-entering a failed folio costs no request. A static canvas has no
 * `info.json` and so had no equivalent — its failure lived only in the host's
 * per-canvas `canvasErrors`, which the residency reconciliation clears when the
 * canvas leaves the window along with the URL and the pixels. That made a 404
 * static image a **fresh request every time the reader scrolled back**, which is
 * exactly what the spec's eviction clause forbids.
 *
 * Keeping the per-canvas record across eviction instead would have meant
 * teaching the reconciliation to distinguish a URL that *changed* (a Choice
 * switch, whose recorded failure is an answer about a request no longer being
 * made) from one merely *released* (eviction, where it still is). Keyed on the
 * **URL** — the same key residency itself is keyed on, and for the same reason —
 * that distinction needs no bookkeeping at all: a Choice switch resolves to a
 * URL this cache has never heard of and therefore has no failure, and eviction
 * resolves back to the same URL and therefore still does. It also gives static
 * failures the same lifetime as service failures, which is what makes "a canvas
 * that failed is not refetched" one rule rather than two.
 *
 * ## Every entry is potentially transient
 *
 * An `<img>` reports no status (which is also why a static failure can only ever
 * be `load` and never `auth`), so nothing here can be classified permanent the
 * way a `401` or an unparseable document can. A permanently-held entry would
 * therefore let one dropped connection blank that canvas for the rest of the
 * page's life, across manifests and SPA navigations, since this cache outlives
 * all of them. So the host calls {@link StaticImageFailures.retryAll} on mount,
 * exactly where it calls `imageServiceCache.retryTransientFailures` — the same
 * bargain, with the whole set treated as the retryable case because none of it
 * can be shown to be otherwise.
 */

/** How many failed URLs to remember. See {@link createStaticImageFailures}. */
const MAX_ENTRIES = 512;

export interface StaticImageFailures {
    /** Has this exact URL already failed to decode? */
    has(url: string): boolean;
    /** Remember that this URL failed. */
    record(url: string): void;
    /**
     * Forget every failure, so the next reconciliation requests them again.
     *
     * Called by the host on mount: no static failure can be shown to be
     * deterministic, so a mount is the moment they all get another chance.
     */
    retryAll(): void;
}

export function createStaticImageFailures(
    maxEntries = MAX_ENTRIES,
): StaticImageFailures {
    /**
     * Insertion-ordered, so the oldest key is simply the first one — the same
     * bound, and the same reasoning, as the metadata cache's entry ceiling: this
     * cache is page-shared and never expires, so an unbounded set grows with
     * every canvas of every manifest a session ever opens.
     */
    const failed = new Set<string>();

    return {
        has: (url) => failed.has(url),
        record(url) {
            failed.add(url);
            while (failed.size > maxEntries) {
                const oldest = failed.values().next();
                if (oldest.done) return;
                failed.delete(oldest.value);
            }
        },
        retryAll() {
            failed.clear();
        },
    };
}

/**
 * The page-shared static-image negative cache.
 *
 * Module-scoped for the same reason `imageServiceCache` is: this is the lifetime
 * that makes re-entering a canvas free, and one instance per renderer would
 * refetch every known-bad image on remount.
 */
export const staticImageFailures: StaticImageFailures =
    createStaticImageFailures();
