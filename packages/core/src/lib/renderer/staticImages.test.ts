// @vitest-environment node
//
// No DOM: the only browser thing this module touches is the `<img>` it builds,
// so a stubbed global `Image` that lands by hand puts every ordering invariant
// below in an ordinary unit test rather than only in Playwright.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStaticImages } from './staticImages';
import { staticImageFailures } from './staticImageFailures';
import type { StaticImageDraw } from './types';

function draw(key: string, canvasId: string, url: string): StaticImageDraw {
    return { key, canvasId, url } as StaticImageDraw;
}

/**
 * Stub `Image` with one that hands back its own load and error callbacks, so a
 * test lands each request when it chooses — which is the only way to hold a
 * request open across a reconciliation.
 *
 * The image handed to `onLoad` is the element itself, so {@link heldUrl} is
 * how an assertion tells one landed request from another.
 */
function deferredLoader() {
    const pending: {
        url: string;
        land: () => void;
        fail: () => void;
    }[] = [];

    vi.stubGlobal(
        'Image',
        class {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            decoding = 'auto';
            url = '';
            set src(url: string) {
                this.url = url;
                pending.push({
                    url,
                    land: () => this.onload?.(),
                    fail: () => this.onerror?.(),
                });
            }
        },
    );

    return { pending };
}

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

    it('requests what is wanted and holds it once decoded', () => {
        const { pending } = deferredLoader();
        const residency = build();

        residency.reconcile([draw('k1', 'c1', 'https://ex/a.jpg')]);
        expect(pending).toHaveLength(1);
        expect(residency.has('k1')).toBe(false);

        pending[0].land();
        expect(residency.has('k1')).toBe(true);
        expect(heldUrl(residency.images['k1'])).toBe('https://ex/a.jpg');
        expect(onChanged).toHaveBeenCalledOnce();
    });

    it('joins an in-flight request for the same URL rather than restarting it', () => {
        const { pending } = deferredLoader();
        const residency = build();
        const wanted = [draw('k1', 'c1', 'https://ex/a.jpg')];

        residency.reconcile(wanted);
        residency.reconcile(wanted);
        residency.reconcile(wanted);

        expect(pending).toHaveLength(1);
    });

    it('holds one image per placement, not per canvas', () => {
        const { pending } = deferredLoader();
        const residency = build();

        // IIIF Cookbook 0036: a miniature painted over a folio, one canvas.
        residency.reconcile([
            draw('k1', 'c1', 'https://ex/folio.jpg'),
            draw('k2', 'c1', 'https://ex/miniature.jpg'),
        ]);
        pending[0].land();
        pending[1].land();

        expect(residency.has('k1')).toBe(true);
        expect(residency.has('k2')).toBe(true);
    });

    it('drops the pixels the moment a Choice supersedes them', () => {
        const { pending } = deferredLoader();
        const residency = build();

        residency.reconcile([draw('k1', 'c1', 'https://ex/colour.jpg')]);
        pending[0].land();
        expect(residency.has('k1')).toBe(true);

        // Same placement, different resolved URL.
        residency.reconcile([draw('k1', 'c1', 'https://ex/infrared.jpg')]);

        // Not "when the replacement decodes" — immediately.
        expect(residency.has('k1')).toBe(false);
        expect(pending).toHaveLength(2);
    });

    it('discards a load that lands after its URL stopped being wanted', () => {
        const { pending } = deferredLoader();
        const residency = build();

        residency.reconcile([draw('k1', 'c1', 'https://ex/colour.jpg')]);
        residency.reconcile([draw('k1', 'c1', 'https://ex/infrared.jpg')]);

        pending[0].land(); // the superseded request finally arrives
        expect(residency.has('k1')).toBe(false);

        pending[1].land();
        expect(heldUrl(residency.images['k1'])).toBe('https://ex/infrared.jpg');
    });

    it('drops anything held for a placement the plan no longer wants', () => {
        const { pending } = deferredLoader();
        const residency = build();

        residency.reconcile([draw('k1', 'c1', 'https://ex/a.jpg')]);
        pending[0].land();

        residency.reconcile([]);

        expect(residency.has('k1')).toBe(false);
        expect(onCanvasErrorCleared).toHaveBeenCalledWith('c1');
    });

    describe('failures', () => {
        it('records the canvas error and stops asking again', () => {
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

        it('refuses a request for a URL that already failed this page', () => {
            const { pending } = deferredLoader();
            staticImageFailures.record('https://ex/404.jpg');
            const residency = build();

            residency.reconcile([draw('k1', 'c1', 'https://ex/404.jpg')]);

            expect(pending).toHaveLength(0);
            expect(onCanvasError).toHaveBeenCalledWith('c1');
        });

        it('remembers a failure across eviction, so re-entry does not refetch', () => {
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

        it('records the failure against the URL even when the placement moved on', () => {
            const { pending } = deferredLoader();
            const residency = build();

            residency.reconcile([draw('k1', 'c1', 'https://ex/bad.jpg')]);
            // Reader switches Choice away while the request is in flight.
            residency.reconcile([draw('k1', 'c1', 'https://ex/good.jpg')]);
            pending[0].fail();

            // The canvas is not blamed — that request is no longer the one
            // being made — but the URL is remembered.
            expect(onCanvasError).not.toHaveBeenCalled();
            expect(staticImageFailures.has('https://ex/bad.jpg')).toBe(true);
        });
    });

    it('clears everything, discarding in-flight loads', () => {
        const { pending } = deferredLoader();
        const residency = build();

        residency.reconcile([
            draw('k1', 'c1', 'https://ex/a.jpg'),
            draw('k2', 'c2', 'https://ex/b.jpg'),
        ]);
        pending[0].land();

        residency.clear();

        expect(residency.has('k1')).toBe(false);
        pending[1].land();
        expect(residency.has('k2')).toBe(false);
    });
});
