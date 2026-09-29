// @vitest-environment node
//
// No DOM: the only browser things this module touches are the `<img>` it builds
// and the bitmap it decodes that to, so a stubbed global `Image` that lands by
// hand and a stubbed `createImageBitmap` put every ordering invariant below in
// an ordinary unit test rather than only in Playwright.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStaticImages } from './staticImages';
import { staticImageFailures } from './staticImageFailures';
import type { StaticImageDraw } from './types';

function draw(key: string, canvasId: string, url: string): StaticImageDraw {
    return { key, canvasId, url } as StaticImageDraw;
}

/**
 * Stub `Image` and `createImageBitmap` with ones that hand back each request's
 * load and error callbacks, so a test lands each request when it chooses —
 * which is the only way to hold a request open across a reconciliation.
 *
 * `land` fires the load and waits for the decode. The bitmap carries its
 * source's URL, so {@link heldUrl} is how an assertion tells one landed request
 * from another, and `closes` counts what was released.
 */
function deferredLoader({ bitmaps = true } = {}) {
    const pending: {
        url: string;
        image: StubImage;
        land: () => Promise<void>;
        fail: () => void;
    }[] = [];
    const closes: Record<string, number> = {};

    class StubImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        decoding = 'auto';
        url = '';
        decode = vi.fn(async () => {});
        get src() {
            return this.url;
        }
        set src(url: string) {
            this.url = url;
            if (url === 'data:,') return;
            pending.push({
                url,
                image: this,
                land: async () => {
                    this.onload?.();
                    await flush();
                },
                fail: () => this.onerror?.(),
            });
        }
    }

    vi.stubGlobal('Image', StubImage);
    vi.stubGlobal('createImageBitmap', async (image: StubImage) => {
        if (!bitmaps) throw new Error('unsupported');
        const url = image.url;
        return {
            url,
            width: 4,
            height: 4,
            close: () => {
                closes[url] = (closes[url] ?? 0) + 1;
            },
        };
    });

    return { pending, closes };
}

/** Let every already-resolved promise callback run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The URL of the image held for a placement — see {@link deferredLoader}. */
function heldUrl(image: unknown): string {
    return (image as { url: string }).url;
}

describe('createStaticImages', () => {
    let onCanvasError: (canvasId: string) => void;
    let onCanvasErrorCleared: (canvasId: string) => void;
    let onChanged: () => void;

    beforeEach(() => {
        onCanvasError = vi.fn<(canvasId: string) => void>();
        onCanvasErrorCleared = vi.fn<(canvasId: string) => void>();
        onChanged = vi.fn<() => void>();
        // The negative cache is page-shared and module-scoped, which is the
        // lifetime that makes re-entering a canvas free. Each case starts from
        // the mount state the host puts it in.
        staticImageFailures.retryAll();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function build() {
        return createStaticImages({
            onCanvasError,
            onCanvasErrorCleared,
            onChanged,
        });
    }

    it('requests what is wanted and holds it once decoded', async () => {
        const { pending } = deferredLoader();
        const residency = build();

        residency.reconcile([draw('k1', 'c1', 'https://ex/a.jpg')]);
        expect(pending).toHaveLength(1);
        expect(residency.has('k1')).toBe(false);

        await pending[0].land();
        expect(residency.has('k1')).toBe(true);
        expect(heldUrl(residency.images['k1'])).toBe('https://ex/a.jpg');
        expect(onChanged).toHaveBeenCalledOnce();
    });

    it('joins an in-flight request for the same URL rather than restarting it', async () => {
        const { pending } = deferredLoader();
        const residency = build();
        const wanted = [draw('k1', 'c1', 'https://ex/a.jpg')];

        residency.reconcile(wanted);
        residency.reconcile(wanted);
        residency.reconcile(wanted);

        expect(pending).toHaveLength(1);
    });

    it('holds one image per placement, not per canvas', async () => {
        const { pending } = deferredLoader();
        const residency = build();

        // IIIF Cookbook 0036: a miniature painted over a folio, one canvas.
        residency.reconcile([
            draw('k1', 'c1', 'https://ex/folio.jpg'),
            draw('k2', 'c1', 'https://ex/miniature.jpg'),
        ]);
        await pending[0].land();
        await pending[1].land();

        expect(residency.has('k1')).toBe(true);
        expect(residency.has('k2')).toBe(true);
    });

    it('drops the pixels the moment a Choice supersedes them', async () => {
        const { pending } = deferredLoader();
        const residency = build();

        residency.reconcile([draw('k1', 'c1', 'https://ex/colour.jpg')]);
        await pending[0].land();
        expect(residency.has('k1')).toBe(true);

        // Same placement, different resolved URL.
        residency.reconcile([draw('k1', 'c1', 'https://ex/infrared.jpg')]);

        // Not "when the replacement decodes" — immediately.
        expect(residency.has('k1')).toBe(false);
        expect(pending).toHaveLength(2);
    });

    it('discards a load that lands after its URL stopped being wanted', async () => {
        const { pending } = deferredLoader();
        const residency = build();

        residency.reconcile([draw('k1', 'c1', 'https://ex/colour.jpg')]);
        residency.reconcile([draw('k1', 'c1', 'https://ex/infrared.jpg')]);

        await pending[0].land(); // the superseded request finally arrives
        expect(residency.has('k1')).toBe(false);

        await pending[1].land();
        expect(heldUrl(residency.images['k1'])).toBe('https://ex/infrared.jpg');
    });

    it('drops anything held for a placement the plan no longer wants', async () => {
        const { pending } = deferredLoader();
        const residency = build();

        residency.reconcile([draw('k1', 'c1', 'https://ex/a.jpg')]);
        await pending[0].land();

        residency.reconcile([]);

        expect(residency.has('k1')).toBe(false);
        expect(onCanvasErrorCleared).toHaveBeenCalledWith('c1');
    });

    describe('failures', () => {
        it('records the canvas error and stops asking again', async () => {
            const { pending } = deferredLoader();
            const residency = build();

            residency.reconcile([draw('k1', 'c1', 'https://ex/404.jpg')]);
            pending[0].fail();

            expect(onCanvasError).toHaveBeenCalledWith('c1');
            expect(onChanged).toHaveBeenCalledOnce();

            // The failed URL stays held, which is what refuses the retry loop.
            residency.reconcile([draw('k1', 'c1', 'https://ex/404.jpg')]);
            expect(pending).toHaveLength(1);
        });

        it('refuses a request for a URL that already failed this page', async () => {
            const { pending } = deferredLoader();
            staticImageFailures.record('https://ex/404.jpg');
            const residency = build();

            residency.reconcile([draw('k1', 'c1', 'https://ex/404.jpg')]);

            expect(pending).toHaveLength(0);
            expect(onCanvasError).toHaveBeenCalledWith('c1');
        });

        it('remembers a failure across eviction, so re-entry does not refetch', async () => {
            const { pending } = deferredLoader();
            const residency = build();

            residency.reconcile([draw('k1', 'c1', 'https://ex/404.jpg')]);
            pending[0].fail();

            // Scrolled away — the per-canvas error goes with the pixels...
            residency.reconcile([]);
            expect(onCanvasErrorCleared).toHaveBeenCalledWith('c1');

            // ...and back. The negative cache answers, with no second request.
            residency.reconcile([draw('k1', 'c1', 'https://ex/404.jpg')]);
            expect(pending).toHaveLength(1);
            expect(onCanvasError).toHaveBeenLastCalledWith('c1');
        });

        it('does not blame a canvas or a URL for a request it cancelled', () => {
            const { pending } = deferredLoader();
            const residency = build();

            residency.reconcile([draw('k1', 'c1', 'https://ex/bad.jpg')]);
            // Reader switches Choice away while the request is in flight.
            residency.reconcile([draw('k1', 'c1', 'https://ex/good.jpg')]);
            pending[0].fail();

            // The request was cancelled, so its answer never arrives: an
            // aborted request is not a failure, and switching back asks again.
            expect(onCanvasError).not.toHaveBeenCalled();
            expect(staticImageFailures.has('https://ex/bad.jpg')).toBe(false);
        });
    });

    describe('decoding and release', () => {
        it('hands the painter a decoded bitmap on first draw', async () => {
            const { pending } = deferredLoader();
            const residency = build();

            residency.reconcile([draw('k1', 'c1', 'https://ex/a.jpg')]);
            pending[0].image.onload?.();

            // Loaded is not drawable: nothing is held until the decode lands.
            expect(residency.has('k1')).toBe(false);
            expect(onChanged).not.toHaveBeenCalled();

            await flush();
            const image = residency.images['k1'];
            expect(image).not.toBe(pending[0].image);
            expect(heldUrl(image)).toBe('https://ex/a.jpg');
            expect('close' in image).toBe(true);
            expect(onChanged).toHaveBeenCalledOnce();
        });

        it('draws the decoded element where no bitmap can be made', async () => {
            const { pending } = deferredLoader({ bitmaps: false });
            const residency = build();

            residency.reconcile([draw('k1', 'c1', 'https://ex/a.svg')]);
            await pending[0].land();

            expect(residency.images['k1']).toBe(pending[0].image);
            expect(pending[0].image.decode).toHaveBeenCalledOnce();
        });

        it('closes a dropped bitmap exactly once', async () => {
            const { pending, closes } = deferredLoader();
            const residency = build();

            residency.reconcile([draw('k1', 'c1', 'https://ex/a.jpg')]);
            await pending[0].land();

            residency.reconcile([]);
            residency.clear();

            expect(closes['https://ex/a.jpg']).toBe(1);
        });

        it('closes held bitmaps on clear', async () => {
            const { pending, closes } = deferredLoader();
            const residency = build();

            residency.reconcile([draw('k1', 'c1', 'https://ex/a.jpg')]);
            await pending[0].land();
            residency.clear();

            expect(closes['https://ex/a.jpg']).toBe(1);
        });

        it('cancels a dropped in-flight download and ignores its late events', async () => {
            const { pending } = deferredLoader();
            const residency = build();

            residency.reconcile([draw('k1', 'c1', 'https://ex/a.jpg')]);
            const { image } = pending[0];
            residency.reconcile([]);

            expect(image.src).toBe('data:,');
            expect(image.onload).toBeNull();
            expect(image.onerror).toBeNull();

            // A late load or error never repopulates the dropped record.
            await pending[0].land();
            pending[0].fail();
            expect(residency.has('k1')).toBe(false);
            expect(onChanged).not.toHaveBeenCalled();
            expect(onCanvasError).not.toHaveBeenCalled();
        });

        it('closes a bitmap whose decode lands after its image was dropped', async () => {
            const { pending, closes } = deferredLoader();
            const residency = build();

            residency.reconcile([draw('k1', 'c1', 'https://ex/a.jpg')]);
            pending[0].image.onload?.();
            residency.reconcile([]);
            await flush();

            expect(residency.has('k1')).toBe(false);
            expect(closes['https://ex/a.jpg']).toBe(1);
            expect(onChanged).not.toHaveBeenCalled();
        });
    });

    it('clears everything, discarding in-flight loads', async () => {
        const { pending } = deferredLoader();
        const residency = build();

        residency.reconcile([
            draw('k1', 'c1', 'https://ex/a.jpg'),
            draw('k2', 'c2', 'https://ex/b.jpg'),
        ]);
        await pending[0].land();

        residency.clear();

        expect(residency.has('k1')).toBe(false);
        await pending[1].land();
        expect(residency.has('k2')).toBe(false);
    });
});
