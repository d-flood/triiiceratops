/**
 * The annotation shape overlay on the first-party renderer (ticket 14).
 *
 * The overlay used to live inside the previous renderer's component and convert
 * coordinates through that library's own viewport, so the Canvas2D renderer
 * showed no annotation shapes at all. It is now a renderer-independent layer bound to the
 * `frame` cadence and to `ViewerState.canvasToScreen`, which is what these specs
 * assert: the shape agrees with the SAME coordinate model the painted pixels are
 * gated against, at rest and after a pan and a zoom.
 *
 * "No visible lag" is exactly that agreement. A shape positioned one frame late
 * is a shape that disagrees with the transform the picture was drawn with, and
 * the disagreement is what a tolerance in CSS pixels measures — which is why one
 * of the specs below samples both sides IN FLIGHT, inside one animation frame. At
 * rest, a one-frame-late overlay agrees with everything.
 */

import { expect, test, type Page } from '@playwright/test';

import {
    getView,
    nextPaint,
    predictScreenPoint,
    setView,
    type RendererView,
} from './helpers/numberedGrid';

const SURFACE = '[data-testid="canvas-renderer-surface"]';
const SHAPE = '[data-annotation-id="annotation-geometry-region"]';

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer specs are Chromium-only.',
);

/** The annotated region, in canvas-space units. */
const REGION = { x: 20, y: 20, width: 30, height: 30 };

/**
 * One 100×100 canvas painted by an inline SVG, with one commenting annotation on
 * a known region — the smallest fixture that has a shape to place.
 */
const MANIFEST = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: '/annotation-geometry-manifest.json',
    type: 'Manifest',
    label: { en: ['Annotation geometry'] },
    items: [
        {
            id: '/annotation-geometry-canvas',
            type: 'Canvas',
            width: 100,
            height: 100,
            items: [
                {
                    id: '/annotation-geometry-painting-page',
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: '/annotation-geometry-painting',
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%232563eb'/%3E%3C/svg%3E",
                                type: 'Image',
                                format: 'image/svg+xml',
                                width: 100,
                                height: 100,
                            },
                            target: '/annotation-geometry-canvas',
                        },
                    ],
                },
            ],
            annotations: [
                {
                    id: '/annotation-geometry-page',
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: 'annotation-geometry-region',
                            type: 'Annotation',
                            motivation: 'commenting',
                            body: {
                                type: 'TextualBody',
                                value: 'A region worth marking',
                            },
                            target: `/annotation-geometry-canvas#xywh=${REGION.x},${REGION.y},${REGION.width},${REGION.height}`,
                        },
                    ],
                },
            ],
        },
    ],
};

async function openAnnotatedManifest(page: Page): Promise<void> {
    await page.route('**/annotation-geometry-manifest.json', (route) =>
        route.fulfill({ json: MANIFEST }),
    );

    const config = encodeURIComponent(
        JSON.stringify({ annotations: { open: true } }),
    );
    await page.goto(
        `/?manifest=/annotation-geometry-manifest.json&config=${config}`,
        { waitUntil: 'domcontentloaded' },
    );
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator(SHAPE).waitFor({ state: 'visible', timeout: 20_000 });
    await settled(page);
}

/**
 * Wait until the SURFACE has stopped resizing, then paint one more frame.
 *
 * The demo page's own chrome — the annotation panel this config opens, the
 * gallery — animates its width for a few hundred milliseconds after load, and
 * the renderer re-measures each time. Both sides of the comparison below read
 * `viewport.width`, so a measurement taken mid-animation is compared against a
 * shape positioned at a different width: a few pixels of disagreement that has
 * nothing to do with the overlay. This is the viewer settling, not the viewport
 * moving, which is why `nextPaint` alone cannot answer it.
 */
async function settled(page: Page): Promise<void> {
    let previous = -1;
    await expect
        .poll(async () => {
            const { width } = await getView(page);
            const stable = width === previous;
            previous = width;
            return stable;
        })
        .toBe(true);
    await nextPaint(page);
}

/** The shape's top-left corner, in CSS pixels from the surface's own corner. */
async function shapeCorner(page: Page): Promise<{ x: number; y: number }> {
    const surface = await page.locator(SURFACE).boundingBox();
    const shape = await page.locator(SHAPE).boundingBox();
    expect(surface, 'the renderer surface has no box').not.toBeNull();
    expect(shape, 'the annotation shape has no box').not.toBeNull();
    return { x: shape!.x - surface!.x, y: shape!.y - surface!.y };
}

async function shapeSize(page: Page): Promise<{ w: number; h: number }> {
    const shape = await page.locator(SHAPE).boundingBox();
    return { w: shape!.width, h: shape!.height };
}

/**
 * The shape agrees with the coordinate model, to within a pixel.
 *
 * The prediction is written out from the view rather than read back from the
 * renderer, exactly as the geometric tile assertions do it: the claim is that the
 * overlay and the documented model agree, so the model side has to be stated
 * independently.
 */
async function expectShapeOnModel(page: Page): Promise<void> {
    const view = await getView(page);
    const expected = predictScreenPoint(REGION, view);
    const corner = await shapeCorner(page);
    const size = await shapeSize(page);

    expect(Math.abs(corner.x - expected.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(corner.y - expected.y)).toBeLessThanOrEqual(1);
    // The size is the transform's too — a shape whose corner tracks while its
    // size is fixed would pass a corner-only assertion at every zoom level.
    expect(Math.abs(size.w - REGION.width * view.scale)).toBeLessThanOrEqual(1);
    expect(Math.abs(size.h - REGION.height * view.scale)).toBeLessThanOrEqual(
        1,
    );
}

test('an annotation shape lands where the coordinate model says', async ({
    page,
}) => {
    await openAnnotatedManifest(page);
    await expectShapeOnModel(page);
});

/**
 * One sample of both sides of the claim, taken inside a single animation frame.
 *
 * The two `settled` assertions above compare the shape with the model AT REST,
 * which a one-frame-late overlay passes unchanged: give it a frame and it catches
 * up. The same-frame property — the frame listener runs inside the renderer's
 * `requestAnimationFrame` callback and Svelte flushes on the microtask after it,
 * before the browser composites — is only observable while the viewport is
 * moving, and only if the view and the DOM box are read in the same tick. Two
 * Playwright round-trips cannot do that; one `evaluate` in the page can.
 */
interface FlightSample {
    view: RendererView;
    /** The shape's top-left corner, in CSS pixels from the surface's corner. */
    x: number;
    y: number;
    moving: boolean;
}

async function sampleDuringZoom(
    page: Page,
    factor: number,
    frames: number,
): Promise<FlightSample[]> {
    return page.locator(SURFACE).evaluate(
        async (element, args: { factor: number; frames: number }) => {
            const surface = element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: {
                    getView(): RendererView;
                    zoomAt(
                        anchor: { x: number; y: number },
                        factor: number,
                    ): Promise<void>;
                    isMoving(): boolean;
                };
            };
            const handle = surface.__triiiceratopsRenderer;
            if (!handle) throw new Error('renderer test handle not installed');

            // From the surface's own root, not from `document`: a Playwright
            // locator pierces a shadow root and `document.querySelector` does
            // not, and the demo page may hold the viewer as a custom element.
            const tree = surface.getRootNode() as Document | ShadowRoot;
            const shape = tree.querySelector(
                '[data-annotation-id="annotation-geometry-region"]',
            );
            if (!shape) throw new Error('the annotation shape is not rendered');

            // Deliberately NOT awaited: `zoomAt` resolves once the spring has
            // settled, and the whole point is to read the in-flight frames.
            void handle.zoomAt(
                { x: surface.clientWidth / 2, y: surface.clientHeight / 2 },
                args.factor,
            );

            const samples: FlightSample[] = [];
            for (let i = 0; i < args.frames; i += 1) {
                // Registered fresh each iteration, so this callback is appended
                // AFTER the renderer's own frame callback for the frame it runs
                // in — which is what makes the read see this frame's view and
                // this frame's flushed DOM rather than the previous frame's of
                // both, where a late overlay would agree with itself.
                await new Promise<void>((resolve) =>
                    requestAnimationFrame(() => resolve()),
                );
                const view = handle.getView();
                const box = shape.getBoundingClientRect();
                const surfaceBox = surface.getBoundingClientRect();
                samples.push({
                    view,
                    x: box.x - surfaceBox.x,
                    y: box.y - surfaceBox.y,
                    moving: handle.isMoving(),
                });
            }
            return samples;
        },
        { factor, frames },
    ) as Promise<FlightSample[]>;
}

test('the shape agrees with the model DURING an animation, not only at rest', async ({
    page,
}) => {
    await openAnnotatedManifest(page);

    const samples = (await sampleDuringZoom(page, 3, 12)).filter(
        (sample) => sample.moving,
    );

    // Vacuity guards: the viewport really was animating, and it moved far enough
    // between frames that a one-frame lag would exceed the tolerance below.
    expect(
        samples.length,
        'no in-flight frames were sampled, so nothing was asserted',
    ).toBeGreaterThan(2);
    const steps = samples
        .slice(1)
        .map((sample, index) => Math.abs(sample.x - samples[index].x));
    expect(
        Math.max(...steps),
        'the shape never moved more than a pixel per frame, so a frame of lag would be invisible',
    ).toBeGreaterThan(2);

    for (const sample of samples) {
        const expected = predictScreenPoint(REGION, sample.view);
        expect(
            Math.abs(sample.x - expected.x),
            `x disagreed mid-flight at scale ${sample.view.scale}`,
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(sample.y - expected.y),
            `y disagreed mid-flight at scale ${sample.view.scale}`,
        ).toBeLessThanOrEqual(1);
    }
});

test('the shape tracks the image through a pan and a zoom', async ({
    page,
}) => {
    await openAnnotatedManifest(page);
    const { centre, scale } = await getView(page);

    // Panned: the shape must have moved with the picture, not stayed put.
    const before = await shapeCorner(page);
    await setView(page, {
        centre: { x: centre.x + 12, y: centre.y - 8 },
        scale,
    });
    await settled(page);
    await expectShapeOnModel(page);
    const after = await shapeCorner(page);
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(1);

    // Zoomed: the shape's SIZE moves with the scale as well as its position.
    await setView(page, {
        centre: { x: centre.x + 12, y: centre.y - 8 },
        scale: scale * 2.5,
    });
    await settled(page);
    await expectShapeOnModel(page);
});
