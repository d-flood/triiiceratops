/**
 * The **paint hook**: an ordered layer, called each frame after the
 * tiles are painted, with the 2D context and the transform the tiles were drawn
 * with.
 *
 * These claims can only be made in a browser:
 *
 * - **The same transform, in the same frame.** Asserted the way every other
 *   geometric claim here is: the layer draws a solid marker at a
 *   canvas-space point, and its centroid on the finished canvas is compared with
 *   the coordinate model's prediction — within a pixel. A layer handed a stale or
 *   different matrix lands somewhere else.
 * - **Deterministic ordering, and a clean unregister.** Two layers drawing the
 *   same box in different colours: whichever draws last is the colour that
 *   survives, so paint order is readable from the pixels rather than from a call
 *   log the implementation could satisfy while painting in the other order.
 * - **Isolation between layers.** One layer leaves a clip, an alpha, and a
 *   transform behind and never restores; the next layer's ink still lands in the
 *   right place at full strength, and so do the tiles on the following frame.
 *   `paintLayers.test.ts` can only assert the ORDER of `save`/`restore` calls
 *   against a stub, which is not the same claim.
 *
 * The layers are registered through `ViewerState.registerPaintLayer` — the real
 * public surface — reached through the renderer's internal test handle because
 * the demo page holds the viewer as a component and puts its state on no global.
 */

import { expect, test } from '@playwright/test';

import {
    expectFeatureOnModel,
    getView,
    GRID_FEATURES,
    nextPaint,
    openGridManifest,
    predictScreenPoint,
} from './helpers/numberedGrid';

const SURFACE = '[data-testid="canvas-renderer-surface"]';

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer specs are Chromium-only.',
);

/**
 * Two colours no fixture pixel is anywhere near — the grid is white, three greys,
 * and five saturated markers — so a tolerance-based centroid cannot be fooled by
 * the picture underneath.
 */
const INK = { r: 120, g: 0, b: 255 };
const OVER_INK = { r: 255, g: 140, b: 0 };

interface LayerSpec {
    id: string;
    order?: number;
    /** Canvas-space centre of the marker this layer paints. */
    at: { x: number; y: number };
    /** Marker side, in canvas-space units. */
    size: number;
    colour: { r: number; g: number; b: number };
}

/**
 * Register a paint layer that fills a square in the space the context arrives
 * in, and repaint.
 *
 * The layer does no coordinate maths of its own — that is the point. It draws in
 * canvas-space units and the transform it was handed is what puts the ink on
 * screen, which is exactly what a plugin overlay would do.
 */
async function registerMarkerLayer(
    page: import('@playwright/test').Page,
    spec: LayerSpec,
): Promise<void> {
    await page.locator(SURFACE).evaluate((element, layer: LayerSpec) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: {
                    registerPaintLayer(input: {
                        id: string;
                        order?: number;
                        draw: (
                            ctx: CanvasRenderingContext2D,
                            frame: unknown,
                        ) => void;
                    }): () => void;
                    nextPaint(): Promise<void>;
                };
            }
        ).__triiiceratopsRenderer;
        if (!handle) throw new Error('renderer test handle not installed');

        const registry = ((
            window as unknown as {
                __paintLayers?: Record<string, () => void>;
            }
        ).__paintLayers ??= {});

        registry[layer.id] = handle.registerPaintLayer({
            id: layer.id,
            order: layer.order,
            draw: (ctx) => {
                ctx.fillStyle = `rgb(${layer.colour.r}, ${layer.colour.g}, ${layer.colour.b})`;
                ctx.fillRect(
                    layer.at.x - layer.size / 2,
                    layer.at.y - layer.size / 2,
                    layer.size,
                    layer.size,
                );
            },
        });
        return handle.nextPaint();
    }, spec);
}

async function releaseLayer(
    page: import('@playwright/test').Page,
    id: string,
): Promise<void> {
    await page.locator(SURFACE).evaluate((element, layerId: string) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: { nextPaint(): Promise<void> };
            }
        ).__triiiceratopsRenderer;
        (
            window as unknown as { __paintLayers?: Record<string, () => void> }
        ).__paintLayers?.[layerId]?.();
        return handle!.nextPaint();
    }, id);
}

/** The centroid of an exact colour on the finished canvas, in CSS pixels. */
async function findInk(
    page: import('@playwright/test').Page,
    colour: { r: number; g: number; b: number },
): Promise<{ x: number; y: number } | null> {
    return page
        .locator(SURFACE)
        .evaluate((element, target: { r: number; g: number; b: number }) => {
            const canvas = element as HTMLCanvasElement;
            const ctx = canvas.getContext('2d');
            if (!ctx || canvas.width === 0) return null;

            const { data } = ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
            );
            const TOLERANCE = 24;
            let sumX = 0;
            let sumY = 0;
            let count = 0;

            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 200) continue;
                if (
                    Math.abs(data[i] - target.r) > TOLERANCE ||
                    Math.abs(data[i + 1] - target.g) > TOLERANCE ||
                    Math.abs(data[i + 2] - target.b) > TOLERANCE
                ) {
                    continue;
                }
                const pixel = i / 4;
                sumX += (pixel % canvas.width) + 0.5;
                sumY += Math.floor(pixel / canvas.width) + 0.5;
                count += 1;
            }

            if (count === 0) return null;

            return {
                x: sumX / count / (canvas.width / canvas.clientWidth),
                y: sumY / count / (canvas.height / canvas.clientHeight),
            };
        }, colour);
}

test('a registered layer draws under the same transform as the tiles', async ({
    page,
}) => {
    await openGridManifest(page);

    // Anchored on a fixture feature, so the assertion is against a point whose
    // painted position is itself gated elsewhere in this suite.
    const at = { x: GRID_FEATURES.charlie.x, y: GRID_FEATURES.charlie.y };
    await registerMarkerLayer(page, {
        id: 'e2e:marker',
        at,
        size: 40,
        colour: INK,
    });

    const view = await getView(page);
    const expected = predictScreenPoint(at, view);
    const actual = await findInk(page, INK);

    expect(actual, 'the registered layer painted nothing').not.toBeNull();
    expect(Math.abs(actual!.x - expected.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual!.y - expected.y)).toBeLessThanOrEqual(1);
});

test('layer order decides what covers what, and unregistering is clean', async ({
    page,
}) => {
    await openGridManifest(page);

    const at = { x: GRID_FEATURES.bravo.x, y: GRID_FEATURES.bravo.y };

    // Registered in the WRONG order deliberately: the lower `order` must draw
    // first whichever order the registrations arrived in, so the higher one's
    // colour is what is left on the canvas.
    await registerMarkerLayer(page, {
        id: 'e2e:over',
        order: 10,
        at,
        // Larger than the layer it covers, so the covered layer's ANTIALIASED
        // EDGE goes too. Equal sizes leave a one-pixel fringe of the colour
        // underneath, and this assertion is about paint order rather than about
        // resampling.
        size: 44,
        colour: OVER_INK,
    });
    await registerMarkerLayer(page, {
        id: 'e2e:under',
        order: 1,
        at,
        size: 24,
        colour: INK,
    });

    expect(await findInk(page, OVER_INK)).not.toBeNull();
    expect(
        await findInk(page, INK),
        'the lower-ordered layer was not covered, so it drew last',
    ).toBeNull();

    // Unregistering the top layer reveals the one underneath — which is both
    // halves of "removes the layer cleanly": its ink is gone, and nothing else
    // was disturbed.
    await releaseLayer(page, 'e2e:over');
    expect(await findInk(page, OVER_INK)).toBeNull();
    expect(await findInk(page, INK)).not.toBeNull();

    await releaseLayer(page, 'e2e:under');
    await nextPaint(page);
    expect(await findInk(page, INK)).toBeNull();
});

test('a layer that leaks context state cannot change what the next one draws', async ({
    page,
}) => {
    await openGridManifest(page);

    // The isolation the whole design rests on, asserted where it is observable:
    // in the pixels. The unit test can only read the ORDER of `save`/`restore`
    // calls against a stub, which a `drawPaintLayers` that never restored at all
    // could still satisfy for one layer. Here the first layer clips to nothing,
    // makes itself all but transparent, and rotates the world — and never
    // restores. If the bracket were missing, the second layer's ink would be
    // clipped away, faded, or somewhere else entirely.
    await page.locator(SURFACE).evaluate((element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: {
                    registerPaintLayer(input: {
                        id: string;
                        order?: number;
                        draw: (ctx: CanvasRenderingContext2D) => void;
                    }): () => void;
                    nextPaint(): Promise<void>;
                };
            }
        ).__triiiceratopsRenderer;
        if (!handle) throw new Error('renderer test handle not installed');

        handle.registerPaintLayer({
            id: 'e2e:leaks',
            order: 1,
            draw: (ctx) => {
                ctx.beginPath();
                ctx.rect(0, 0, 0, 0);
                ctx.clip();
                ctx.globalAlpha = 0.02;
                ctx.rotate(Math.PI / 3);
                ctx.translate(9999, 9999);
                // Deliberately no `restore`, and no `save` of its own either.
            },
        });
        return handle.nextPaint();
    });

    const at = { x: GRID_FEATURES.delta.x, y: GRID_FEATURES.delta.y };
    await registerMarkerLayer(page, {
        id: 'e2e:after-leak',
        order: 2,
        at,
        size: 40,
        colour: INK,
    });

    const view = await getView(page);
    const expected = predictScreenPoint(at, view);
    const actual = await findInk(page, INK);

    expect(
        actual,
        'the leaked clip or alpha reached the next layer',
    ).not.toBeNull();
    expect(Math.abs(actual!.x - expected.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual!.y - expected.y)).toBeLessThanOrEqual(1);

    // And not into the next FRAME either: the context outlives the call, so a
    // leak that survives the frame would blank or displace the tiles themselves.
    await nextPaint(page);
    await expectFeatureOnModel(page, 'bravo');
});

test('a layer that throws does not stop the renderer painting', async ({
    page,
}) => {
    await openGridManifest(page);

    await page.locator(SURFACE).evaluate((element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: {
                    registerPaintLayer(input: {
                        id: string;
                        draw: () => void;
                    }): () => void;
                    nextPaint(): Promise<void>;
                };
            }
        ).__triiiceratopsRenderer;
        handle!.registerPaintLayer({
            id: 'e2e:throws',
            draw: () => {
                throw new Error('deliberate paint layer failure');
            },
        });
        return handle!.nextPaint();
    });

    // The picture is still there, and a layer registered after the broken one
    // still draws — the throw is contained to its own layer, not to the frame.
    await registerMarkerLayer(page, {
        id: 'e2e:after-throw',
        at: { x: GRID_FEATURES.alpha.x, y: GRID_FEATURES.alpha.y },
        size: 40,
        colour: INK,
    });
    expect(await findInk(page, INK)).not.toBeNull();
});
