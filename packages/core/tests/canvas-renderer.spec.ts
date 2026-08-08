/**
 * Seam 2 — the first tracer bullet through the first-party Canvas2D renderer.
 *
 * These specs select the renderer per test through the development-only flag
 * (an ordinary mutable global on the dev server), so the rest of the suite goes
 * on exercising the OpenSeadragon path in the same run — which is exactly the
 * side-by-side comparison the expand half of the epic exists for.
 *
 * Chromium only for this slice: everything asserted here is coordinate maths
 * and Pointer Events, and widening the matrix before the renderer has tiles
 * would buy noise rather than coverage.
 */

import { expect, test, type Page } from '@playwright/test';

import {
    expectFeatureOnModel,
    findFeature,
    getView,
    GRID_FEATURES,
    nextPaint,
    openGridManifest,
    predictScreenPoint,
    setView,
} from './helpers/numberedGrid';

const SURFACE = '[data-testid="canvas-renderer-surface"]';
const ROOT = '[data-testid="canvas-renderer-root"]';

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only until it has tiles (ticket 05).',
);

/**
 * Wait until the wheel animation has settled onto its target.
 *
 * This says nothing about HOW it got there — a renderer that snapped straight
 * onto the target on the first frame would satisfy it immediately. That the
 * motion is actually eased is asserted separately, below, by sampling the scale
 * on successive frames.
 */
async function settle(page: Page): Promise<void> {
    let previous = -1;
    await expect
        .poll(
            async () => {
                const { scale } = await getView(page);
                const settled = Math.abs(scale - previous) < 1e-9;
                previous = scale;
                return settled;
            },
            { timeout: 10_000 },
        )
        .toBe(true);
    await nextPaint(page);
}

test.describe('Canvas2D renderer — static image', () => {
    test('renders a static-image manifest on a canvas element', async ({
        page,
    }) => {
        await openGridManifest(page);

        // The OpenSeadragon host is not mounted at all — the flag selects one
        // renderer, never both.
        await expect(page.locator('.osd-root')).toHaveCount(0);
        await expect(page.locator(SURFACE)).toBeVisible();

        const view = await getView(page);
        expect(view.width).toBeGreaterThan(0);
        expect(view.height).toBeGreaterThan(0);

        // The backing store is capped at min(devicePixelRatio, 2).
        expect(view.dpr).toBeLessThanOrEqual(2);
        // Measured from the FRACTIONAL box, not `clientWidth`: the viewport
        // keeps the rect's real size and only the backing store is rounded, so
        // `clientWidth` (itself rounded) would be comparing against a different
        // number whenever the CSS box is fractional.
        const backing = await page.locator(SURFACE).evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return {
                width: (element as HTMLCanvasElement).width,
                height: (element as HTMLCanvasElement).height,
                cssWidth: rect.width,
                cssHeight: rect.height,
            };
        });
        expect(backing.width).toBe(
            Math.max(1, Math.round(backing.cssWidth * view.dpr)),
        );
        expect(backing.height).toBe(
            Math.max(1, Math.round(backing.cssHeight * view.dpr)),
        );

        // The viewport is the CSS box exactly, fraction and all.
        expect(view.width).toBeCloseTo(backing.cssWidth, 6);
        expect(view.height).toBeCloseTo(backing.cssHeight, 6);
    });

    test('drags the image 1:1 with the pointer, with no easing', async ({
        page,
    }) => {
        await openGridManifest(page);

        const before = await getView(page);
        const box = (await page.locator(SURFACE).boundingBox())!;
        const start = {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
        };
        const delta = { x: -137, y: 94 };

        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + delta.x, start.y + delta.y);

        // Read the transform IMMEDIATELY, with no settling wait: drag is
        // direct, so the full delta is already applied in the pointer-move
        // handler. A renderer that animates the pan target — as the
        // OpenSeadragon path does — would still be part-way there.
        const during = await getView(page);
        expect(during.centre.x).toBeCloseTo(
            before.centre.x - delta.x / before.scale,
            5,
        );
        expect(during.centre.y).toBeCloseTo(
            before.centre.y - delta.y / before.scale,
            5,
        );
        expect(during.scale).toBeCloseTo(before.scale, 10);

        // Held still before releasing, so this asserts the DRAG and nothing
        // else. Releasing straight from a fast move is a flick and carries
        // momentum by design (ticket 10) — a different behaviour, asserted
        // separately in `canvas-renderer-input.spec.ts`.
        await page.waitForTimeout(150);
        await page.mouse.up();

        // And it stays there: no spring settles it somewhere else afterwards.
        await nextPaint(page);
        const after = await getView(page);
        expect(after.centre.x).toBeCloseTo(during.centre.x, 5);
        expect(after.centre.y).toBeCloseTo(during.centre.y, 5);
    });

    test('drag moves the painted pixels by exactly the pointer delta', async ({
        page,
    }) => {
        await openGridManifest(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.5 });

        const before = (await findFeature(page, 'bravo'))!;
        expect(before).not.toBeNull();

        const box = (await page.locator(SURFACE).boundingBox())!;
        const delta = { x: 60, y: -45 };
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
            box.x + box.width / 2 + delta.x,
            box.y + box.height / 2 + delta.y,
        );
        // Held still before releasing: a flick would add momentum on top of
        // the delta under test. See the note in the drag test above.
        await page.waitForTimeout(150);
        await page.mouse.up();
        await nextPaint(page);

        const after = (await findFeature(page, 'bravo'))!;
        expect(Math.abs(after.x - (before.x + delta.x))).toBeLessThanOrEqual(1);
        expect(Math.abs(after.y - (before.y + delta.y))).toBeLessThanOrEqual(1);
    });

    test('wheel zoom keeps the point under the cursor fixed across a full zoom range', async ({
        page,
    }) => {
        await openGridManifest(page);

        const box = (await page.locator(SURFACE).boundingBox())!;
        const view = await getView(page);

        // Park the cursor away from the viewport centre — a centre-anchored
        // implementation would pass an anchor test taken at the centre — and
        // then read back the anchor the renderer ACTUALLY receives. Predicting
        // it is not good enough: `clientX`/`clientY` are whole numbers while
        // the canvas's bounding rect need not be, so a predicted anchor can sit
        // half a pixel off the real one, and anchored zoom faithfully magnifies
        // that half pixel until it fails the assertion for the wrong reason.
        await page.locator(SURFACE).evaluate((element) => {
            const recorded = { x: 0, y: 0 };
            (
                window as unknown as { __wheelAnchor: typeof recorded }
            ).__wheelAnchor = recorded;
            element.addEventListener('wheel', (event) => {
                const rect = element.getBoundingClientRect();
                recorded.x = (event as WheelEvent).clientX - rect.left;
                recorded.y = (event as WheelEvent).clientY - rect.top;
            });
        });

        await page.mouse.move(
            box.x + Math.round(view.width / 2) - 150,
            box.y + Math.round(view.height / 2) - 100,
        );
        // A zero-delta wheel changes nothing (exp(0) === 1) and reports the
        // anchor.
        await page.mouse.wheel(0, 0);
        const anchorLocal = await page.evaluate(
            () =>
                (
                    window as unknown as {
                        __wheelAnchor: { x: number; y: number };
                    }
                ).__wheelAnchor,
        );

        // Put a feature exactly on that anchor.
        const scale = 0.4;
        await setView(page, {
            scale,
            centre: {
                x:
                    GRID_FEATURES.alpha.x -
                    (anchorLocal.x - view.width / 2) / scale,
                y:
                    GRID_FEATURES.alpha.y -
                    (anchorLocal.y - view.height / 2) / scale,
            },
        });

        for (const step of [-240, -240, -240, 240, 240, 240, 240]) {
            await page.mouse.wheel(0, step);
            await settle(page);

            const found = await findFeature(page, 'alpha');
            expect(
                found,
                'the anchored feature left the viewport',
            ).not.toBeNull();
            expect(Math.abs(found!.x - anchorLocal.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(found!.y - anchorLocal.y)).toBeLessThanOrEqual(1);
        }

        // The range actually exercised was a real one, not a rounding error.
        expect((await getView(page)).scale).not.toBeCloseTo(scale, 2);
    });

    test('wheel zoom is eased over several frames, never snapped in one', async ({
        page,
    }) => {
        await openGridManifest(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.4 });

        // The scale is sampled once per animation frame INSIDE the page, and
        // the wheel is a REAL input event. Both matter:
        //
        // - a round-trip per sample takes long enough for the animation to
        //   finish in between, so a polled test cannot see the trajectory;
        // - a synthetic `dispatchEvent` runs in an ordinary script task, while
        //   real input is dispatched against the frame already in flight — which
        //   is what gives the first `requestAnimationFrame` callback a timestamp
        //   that can PRECEDE the `performance.now()` the handler read. Snapping
        //   on that first non-positive step is exactly the regression this
        //   guards, and a synthetic event would not reproduce it.
        await page.locator(SURFACE).evaluate((element) => {
            const handle = (
                element as HTMLCanvasElement & {
                    __triiiceratopsRenderer?: { getView(): { scale: number } };
                }
            ).__triiiceratopsRenderer!;
            const recorder = window as unknown as {
                __scaleSamples: number[];
                __wheelAt: number;
            };

            recorder.__scaleSamples = [];
            recorder.__wheelAt = -1;
            element.addEventListener('wheel', () => {
                // The index of the first sample taken AFTER the wheel arrived.
                if (recorder.__wheelAt < 0) {
                    recorder.__wheelAt = recorder.__scaleSamples.length;
                }
            });

            const tick = () => {
                recorder.__scaleSamples.push(handle.getView().scale);
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });

        const box = (await page.locator(SURFACE).boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -240);
        await settle(page);

        const { samples, wheelAt } = await page.evaluate(() => {
            const recorder = window as unknown as {
                __scaleSamples: number[];
                __wheelAt: number;
            };
            return {
                samples: recorder.__scaleSamples,
                wheelAt: recorder.__wheelAt,
            };
        });

        expect(
            wheelAt,
            'the wheel event never reached the renderer',
        ).toBeGreaterThanOrEqual(0);
        const during = samples.slice(wheelAt);

        // It moved at all…
        expect(during[during.length - 1]).toBeGreaterThan(0.4);
        // …and it did NOT arrive in one frame. An instant snap puts the target
        // in the first post-wheel sample and every sample after it, so the
        // trajectory has exactly one distinct value; easing produces a run of
        // them. This is precisely what `settle()` above cannot see.
        expect(
            new Set(during).size,
            `wheel zoom reached its target in one frame: ${during.slice(0, 6).join(', ')}`,
        ).toBeGreaterThan(2);
        // Monotonic towards the target, with no overshoot.
        for (let i = 1; i < during.length; i += 1) {
            expect(during[i]).toBeGreaterThanOrEqual(during[i - 1]);
        }
    });

    test('lands a named feature on its predicted screen pixel within 1px at three zoom levels', async ({
        page,
    }) => {
        await openGridManifest(page);

        for (const scale of [0.4, 0.9, 2.5]) {
            await setView(page, { centre: { x: 600, y: 450 }, scale });
            const view = await getView(page);

            for (const name of Object.keys(GRID_FEATURES) as Array<
                keyof typeof GRID_FEATURES
            >) {
                const predicted = predictScreenPoint(GRID_FEATURES[name], view);
                // Only assert features that are comfortably on screen: a marker
                // clipped by the viewport edge has a truncated, and therefore
                // displaced, centroid.
                const margin = 30;
                if (
                    predicted.x < margin ||
                    predicted.y < margin ||
                    predicted.x > view.width - margin ||
                    predicted.y > view.height - margin
                ) {
                    continue;
                }

                await expectFeatureOnModel(page, name, 1);
            }
        }
    });

    test('never paints a background: the canvas is transparent and the viewer background is CSS', async ({
        page,
    }) => {
        await openGridManifest(page);
        // Zoom far enough out that the image occupies only part of the canvas,
        // leaving area the canvas would have filled if it painted a background.
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.1 });

        const cornerAlpha = await page.locator(SURFACE).evaluate((element) => {
            const canvas = element as HTMLCanvasElement;
            const ctx = canvas.getContext('2d')!;
            return ctx.getImageData(2, 2, 1, 1).data[3];
        });
        expect(cornerAlpha).toBe(0);

        // The background is a CSS `background-color` on the parent, driven by
        // theme tokens — so switching theme changes it with no JS involvement
        // and no repaint.
        const root = page.locator(ROOT);
        await expect(root).toHaveClass(/has-bg/);

        const viewerRoot = page.locator('.viewer-root').first();
        const readBackground = () =>
            root.evaluate(
                (element) => getComputedStyle(element).backgroundColor,
            );

        await viewerRoot.evaluate((element) =>
            element.setAttribute('data-theme', 'light'),
        );
        const light = await readBackground();
        await viewerRoot.evaluate((element) =>
            element.setAttribute('data-theme', 'dark'),
        );
        const dark = await readBackground();

        expect(light).not.toBe(dark);
    });

    test('honours the transparent-background config', async ({ page }) => {
        // Driven through the custom element's `config` input, i.e. exactly the
        // way an integrator compositing the viewer over their own design would.
        await page.goto('/e2e/canvas-renderer-wc.html', {
            waitUntil: 'domcontentloaded',
        });
        const root = page.locator(ROOT);
        await root.waitFor({ state: 'visible', timeout: 30_000 });
        await expect(root).toHaveClass(/has-bg/);

        await page.evaluate(() =>
            document
                .getElementById('v')
                ?.setAttribute('config', '{"transparentBackground":true}'),
        );

        await expect(root).not.toHaveClass(/has-bg/);
        await expect(root).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    });

    test('works inside the custom element shadow root', async ({ page }) => {
        await page.goto('/e2e/canvas-renderer-wc.html', {
            waitUntil: 'domcontentloaded',
        });

        const surface = page.locator(SURFACE);
        await surface.waitFor({ state: 'visible', timeout: 30_000 });

        // The surface really is inside a shadow root, not light DOM that
        // happened to match.
        const inShadow = await page.evaluate(() => {
            const host = document.getElementById('v');
            return !!host?.shadowRoot?.querySelector(
                '[data-testid="canvas-renderer-surface"]',
            );
        });
        expect(inShadow).toBe(true);

        await expect
            .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
            .not.toBeNull();

        // Geometry, pointer capture, and the transform behave identically
        // across the shadow boundary.
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.5 });
        await expectFeatureOnModel(page, 'bravo', 1);
        await expectFeatureOnModel(page, 'alpha', 1);

        const box = (await surface.boundingBox())!;
        const before = await getView(page);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
            box.x + box.width / 2 - 50,
            box.y + box.height / 2,
        );
        const during = await getView(page);
        await page.mouse.up();

        expect(during.centre.x).toBeCloseTo(
            before.centre.x + 50 / before.scale,
            5,
        );
    });
});
