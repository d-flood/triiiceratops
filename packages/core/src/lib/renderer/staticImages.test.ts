// @vitest-environment node
//
// No DOM: the browser enters through `loadImage`, which is the point of the
// module — every ordering invariant below is asserted here rather than only
// reachable through Playwright.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStaticImages, type ImageLoader } from './staticImages';
import { createStaticImageFailures } from './staticImageFailures';
import type { StaticImageDraw } from './types';

function draw(key: string, canvasId: string, url: string): StaticImageDraw {
    return { key, canvasId, url } as StaticImageDraw;
}

/** A loader that hands back resolvers so a test lands requests by hand. */
function deferredLoader() {
    const pending: {
        url: string;
        land: (image?: unknown) => void;
        fail: () => void;
    }[] = [];
    const loadImage: ImageLoader = (url, { onLoad, onError }) => {
        pending.push({
            url,
            land: (image = { url }) => onLoad(image as CanvasImageSource),
            fail: onError,
        });
    };
    return { loadImage, pending };
}

describe('createStaticImages', () => {
    let onCanvasError: (canvasId: string) => void;
    let onCanvasErrorCleared: (canvasId: string) => void;
    let onChanged: () => void;

    beforeEach(() => {
        onCanvasError = vi.fn<(canvasId: string) => void>();
        onCanvasErrorCleared = vi.fn<(canvasId: string) => void>();
        onChanged = vi.fn<() => void>();
    });

    function build(loadImage: ImageLoader) {
        return createStaticImages({
            loadImage,
            failures: createStaticImageFailures(),
            onCanvasError,
            onCanvasErrorCleared,
            onChanged,
        });
    }

    it('requests what is wanted and holds it once decoded', () => {
        const { loadImage, pending } = deferredLoader();
        const residency = build(loadImage);

        residency.reconcile([draw('k1', 'c1', 'https://ex/a.jpg')]);
        expect(pending).toHaveLength(1);
        expect(residency.has('k1')).toBe(false);

        pending[0].land();
        expect(residency.has('k1')).toBe(true);
        expect(residency.images['k1']).toEqual({ url: 'https://ex/a.jpg' });
        expect(onChanged).toHaveBeenCalledOnce();
    });

    it('joins an in-flight request for the same URL rather than restarting it', () => {
        const { loadImage, pending } = deferredLoader();
        const residency = build(loadImage);
        const wanted = [draw('k1', 'c1', 'https://ex/a.jpg')];

        residency.reconcile(wanted);
        residency.reconcile(wanted);
        residency.reconcile(wanted);

        expect(pending).toHaveLength(1);
    });

    it('holds one image per placement, not per canvas', () => {
        const { loadImage, pending } = deferredLoader();
        const residency = build(loadImage);

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
        const { loadImage, pending } = deferredLoader();
        const residency = build(loadImage);

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
        const { loadImage, pending } = deferredLoader();
        const residency = build(loadImage);

        residency.reconcile([draw('k1', 'c1', 'https://ex/colour.jpg')]);
        residency.reconcile([draw('k1', 'c1', 'https://ex/infrared.jpg')]);

        pending[0].land(); // the superseded request finally arrives
        expect(residency.has('k1')).toBe(false);

        pending[1].land();
        expect(residency.images['k1']).toEqual({
            url: 'https://ex/infrared.jpg',
        });
    });

    it('drops anything held for a placement the plan no longer wants', () => {
        const { loadImage, pending } = deferredLoader();
        const residency = build(loadImage);

        residency.reconcile([draw('k1', 'c1', 'https://ex/a.jpg')]);
        pending[0].land();

        residency.reconcile([]);

        expect(residency.has('k1')).toBe(false);
        expect(onCanvasErrorCleared).toHaveBeenCalledWith('c1');
    });

    describe('failures', () => {
        it('records the canvas error and stops asking again', () => {
            const { loadImage, pending } = deferredLoader();
            const residency = build(loadImage);

            residency.reconcile([draw('k1', 'c1', 'https://ex/404.jpg')]);
            pending[0].fail();

            expect(onCanvasError).toHaveBeenCalledWith('c1');
            expect(onChanged).toHaveBeenCalledOnce();

            // The failed URL stays held, which is what refuses the retry loop.
            residency.reconcile([draw('k1', 'c1', 'https://ex/404.jpg')]);
            expect(pending).toHaveLength(1);
        });

        it('refuses a request for a URL that already failed this page', () => {
            const { loadImage, pending } = deferredLoader();
            const failures = createStaticImageFailures();
            failures.record('https://ex/404.jpg');

            const residency = createStaticImages({
                loadImage,
                failures,
                onCanvasError,
                onCanvasErrorCleared,
                onChanged,
            });

            residency.reconcile([draw('k1', 'c1', 'https://ex/404.jpg')]);

            expect(pending).toHaveLength(0);
            expect(onCanvasError).toHaveBeenCalledWith('c1');
        });

        it('remembers a failure across eviction, so re-entry does not refetch', () => {
            const { loadImage, pending } = deferredLoader();
            const failures = createStaticImageFailures();
            const residency = createStaticImages({
                loadImage,
                failures,
                onCanvasError,
                onCanvasErrorCleared,
                onChanged,
            });

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
            const { loadImage, pending } = deferredLoader();
            const failures = createStaticImageFailures();
            const residency = createStaticImages({
                loadImage,
                failures,
                onCanvasError,
                onCanvasErrorCleared,
                onChanged,
            });

            residency.reconcile([draw('k1', 'c1', 'https://ex/bad.jpg')]);
            // Reader switches Choice away while the request is in flight.
            residency.reconcile([draw('k1', 'c1', 'https://ex/good.jpg')]);
            pending[0].fail();

            // The canvas is not blamed — that request is no longer the one
            // being made — but the URL is remembered.
            expect(onCanvasError).not.toHaveBeenCalled();
            expect(failures.has('https://ex/bad.jpg')).toBe(true);
        });
    });

    it('clears everything, discarding in-flight loads', () => {
        const { loadImage, pending } = deferredLoader();
        const residency = build(loadImage);

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
