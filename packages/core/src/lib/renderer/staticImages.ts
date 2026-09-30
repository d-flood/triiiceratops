/**
 * Which decoded whole images the renderer holds, and the request lifecycle that
 * keeps that set correct.
 *
 * The renderer keeps one decoded image per **placed image** — per painting
 * annotation, not per canvas — and neither of those names is the picture. A
 * canvas can paint several (IIIF Cookbook 0036 paints a miniature over a
 * folio), so a canvas-keyed record would let the second evict the first every
 * frame; and the same placement resolves to a different URL when a different
 * Choice is selected (`state.selectedChoices` → `resolveCanvasImage`), so a
 * placement-keyed record alone would paint the previous choice forever.
 * Residency is therefore keyed on the placement and compared on the resolved
 * URL, which also stands in for a request generation: a load whose URL is no
 * longer the one wanted is cancelled.
 *
 * This module owns the whole question. Its predecessor, `imageRequests.ts`,
 * owned only the set difference and said in its own header that it existed
 * because the host could not be tested — so the diff had a unit test while the
 * ordering invariants that actually break (cancel a request the moment its URL
 * is dropped, so it neither paints nor records a failure; LEAVE a failed URL
 * held; record the held URL before the request starts) sat in a 3000-line
 * component reachable only through Playwright. The seam was cut at the DOM
 * line rather than at an abstraction. Everything here but the `<img>` and its
 * decode is ordinary data, so a unit test stubs the global `Image` and
 * `createImageBitmap` and asserts all of it.
 */

import type { StaticImageDraw } from './types';
import { decodeImage } from './decodeImage';
import { staticImageFailures } from './staticImageFailures';

/** A decoded image the painter can draw. */
export type DecodedImage = ImageBitmap | HTMLImageElement;

function releaseImage(image: DecodedImage): void {
    if ('close' in image) image.close();
}

/**
 * Start one image request. Calls back at most once, and only after the image
 * is decoded. Returns the cancel: after it, neither callback runs, a request
 * still downloading is stopped, and a decode that lands is released.
 */
function loadImage(
    url: string,
    {
        onLoad,
        onError,
    }: { onLoad: (image: DecodedImage) => void; onError: () => void },
): () => void {
    const image = new Image();
    let cancelled = false;

    function detach(): void {
        image.onload = null;
        image.onerror = null;
    }

    // Decode off the main thread where the browser can.
    image.decoding = 'async';
    // `crossOrigin` is deliberately NOT set: most IIIF image servers send no
    // CORS headers, and requesting anonymous CORS would turn a working image
    // into a load failure. The cost is a tainted canvas, which only matters to
    // pixel readback — and the geometric e2e fixtures are same-origin.
    image.onload = () => {
        detach();
        void decodeImage(image).then((decoded) => {
            if (cancelled) releaseImage(decoded);
            else onLoad(decoded);
        });
    };
    image.onerror = () => {
        detach();
        onError();
    };
    image.src = url;

    return () => {
        if (cancelled) return;
        cancelled = true;
        // Detached first: the empty data URL is itself an image error.
        if (image.onload) {
            detach();
            image.src = 'data:,';
        }
    };
}

export interface StaticImagesOptions {
    /** Record that this canvas could not load. */
    onCanvasError: (canvasId: string) => void;
    /** Withdraw a recorded failure for this canvas. */
    onCanvasErrorCleared: (canvasId: string) => void;
    /** A decode landed or a request failed — the frame loop should repaint. */
    onChanged: () => void;
}

export interface StaticImages {
    /**
     * Bring the held set in line with what the plan wants.
     *
     * `wanted` is already gated by the residency tier, so a canvas outside the
     * window contributes none and anything held for it is dropped. A placement
     * whose held URL still matches is left alone — an in-flight request for the
     * same URL is joined, not restarted.
     */
    reconcile(wanted: readonly StaticImageDraw[]): void;
    /**
     * The decoded images, keyed by placement, for the painter.
     *
     * A live readonly view rather than a copy: the paint loop indexes it once
     * per placement per frame.
     */
    readonly images: Readonly<Record<string, DecodedImage>>;
    /** Whether anything is decoded for this placement (painting, for error policy). */
    has(key: string): boolean;
    /** Release everything. An in-flight load that lands afterwards is discarded. */
    clear(): void;
}

export function createStaticImages(options: StaticImagesOptions): StaticImages {
    const images: Record<string, DecodedImage> = Object.create(null);
    /** image key → the URL decoded **or in flight** for that placement. */
    const urls: Record<string, string> = Object.create(null);
    /**
     * image key → the canvas that placement belongs to.
     *
     * Failures are recorded against the CANVAS while pixels are held against the
     * placement, so clearing a failure when its request is dropped needs the
     * mapping back — and a dropped placement is by definition one the current
     * plan no longer contains, so it cannot be looked up there.
     */
    const owners: Record<string, string> = Object.create(null);
    /** image key → the cancel for a request still loading or decoding. */
    const cancels: Record<string, () => void> = Object.create(null);

    function release(key: string): void {
        cancels[key]?.();
        delete cancels[key];
        const image = images[key];
        if (image) releaseImage(image);
        delete images[key];
    }

    function drop(key: string): void {
        const canvasId = owners[key];
        // Drop the pixels too: a stale image must stop painting the moment it is
        // superseded, not when its replacement finishes decoding. A request
        // still in flight is cancelled with them.
        release(key);
        delete urls[key];
        delete owners[key];
        // And the error with them. The URL this placement resolves to has
        // changed or been released, so the recorded failure answers a request
        // that is no longer the one being made — keeping it would leave a
        // placeholder over a Choice that loads perfectly well.
        //
        // Safe for eviction as well as for a Choice switch only because
        // `staticImageFailures` remembers the URL: the canvas coming back
        // re-derives its error from that below, with no second request. Drop
        // this and the per-canvas record is the only memory of the failure,
        // which is the refetch-on-re-entry the renderer must not do.
        if (canvasId) options.onCanvasErrorCleared(canvasId);
    }

    return {
        reconcile(wanted) {
            const wantedUrls = new Map(
                wanted.map((image) => [image.key, image.url]),
            );

            // A `service` source paints tiles, which the tile scheduler holds —
            // it has no whole image, so the planner emits none of these for it
            // and anything held against one is dropped.
            for (const [key, url] of Object.entries(urls)) {
                if (wantedUrls.get(key) !== url) drop(key);
            }

            for (const { key, canvasId, url } of wanted) {
                if (urls[key] === url) continue;

                owners[key] = canvasId;

                if (staticImageFailures.has(url)) {
                    // Answered already, by a request this page made earlier.
                    // Recorded BEFORE the URL, so the state the placeholder is
                    // derived from is in place within this same frame.
                    options.onCanvasError(canvasId);
                    // Held as if in flight: reconciliation compares held URLs,
                    // so this is what stops the next frame asking again.
                    urls[key] = url;
                    continue;
                }

                // Recorded BEFORE the request starts, so a second reconciliation
                // for the same URL joins the in-flight request rather than
                // restarting it.
                urls[key] = url;

                cancels[key] = loadImage(url, {
                    onLoad: (image) => {
                        delete cancels[key];
                        images[key] = image;
                        options.onCanvasErrorCleared(canvasId);
                        options.onChanged();
                    },
                    onError: () => {
                        delete cancels[key];
                        staticImageFailures.record(url);
                        // The URL is deliberately LEFT held, which is what stops
                        // the next frame's reconciliation from asking again: a
                        // request that failed is answered, and a retry loop over
                        // a 404 is what the thumbnail ladder also refuses. Once
                        // this canvas is evicted the URL goes with it, and
                        // `failures` refuses the request on the way back in.
                        options.onCanvasError(canvasId);
                        options.onChanged();
                    },
                });
            }
        },

        images,
        has: (key) => key in images,

        clear() {
            for (const key of Object.keys(urls)) release(key);
            for (const key of Object.keys(urls)) delete urls[key];
            for (const key of Object.keys(owners)) delete owners[key];
        },
    };
}
