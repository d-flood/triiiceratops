/**
 * The Canvas2D renderer's input model (ticket 10).
 *
 * Separate from `canvas-renderer.spec.ts` — which is pinned to Chromium until
 * the renderer has tiles — because **pointer semantics differ across engines**
 * and that is precisely what these assert. Capture, coalescing, the synthesized
 * click that follows a tap, and the order of `pointerup` against `click` are
 * all places engines have historically disagreed, so the gesture model earns
 * the full desktop matrix even while the rest of the renderer does not.
 *
 * The governing rule under test (spec §Input and animation): **continuous
 * input is never animated; discrete and programmatic input always is.**
 *
 * The gesture *geometry* — ownership, pinch midpoint maths, flick velocity,
 * double-tap pairing — is unit-tested directly against the DOM-free recogniser
 * in `src/lib/renderer/gestureArbiter.test.ts`. What is asserted here is the
 * part that only a browser can answer: that real pointer input reaches it and
 * that the viewport does what it says.
 */

import { expect, test, type Page } from '@playwright/test';

import {
    fitCanvasBounds,
    findFeature,
    getStats,
    getView,
    nextPaint,
    openGridManifest,
    setView,
} from './helpers/numberedGrid';
import { MAX_ZOOM_FACTOR } from '../src/lib/renderer/rendererDefaults';

const SURFACE = '[data-testid="canvas-renderer-surface"]';

interface MotionTrace {
    /** Viewport centre x, sampled once per animation frame. */
    samples: number[];
    /** Index of the first sample taken after `pointerup`, or -1. */
    releasedAt: number;
    /** Index of the first sample taken after the next `pointerdown`, or -1. */
    grabbedAt: number;
    /** Whether the renderer reported itself in motion, per sample. */
    moving: boolean[];
}

interface RendererHandle {
    getView(): { centre: { x: number; y: number }; scale: number };
    zoomAt(anchor: { x: number; y: number }, factor: number): Promise<void>;
    fit(): Promise<void>;
    fitCanvasBounds(
        bounds: { x: number; y: number; width: number; height: number },
        canvasId?: string,
    ): Promise<void>;
    isMoving(): boolean;
    nextPaint(): Promise<void>;
}

/**
 * Sample the viewport once per animation frame, from **inside** the page.
 *
 * A polled assertion cannot see a trajectory: one round trip per sample takes
 * longer than the whole glide, so momentum would look identical to a jump.
 */
async function traceMotion(page: Page): Promise<void> {
    await page.locator(SURFACE).evaluate((element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: RendererHandle;
            }
        ).__triiiceratopsRenderer!;
        const trace: MotionTrace = {
            samples: [],
            releasedAt: -1,
            grabbedAt: -1,
            moving: [],
        };
        (window as unknown as { __motion: MotionTrace }).__motion = trace;

        element.addEventListener('pointerup', () => {
            if (trace.releasedAt < 0) trace.releasedAt = trace.samples.length;
        });
        element.addEventListener('pointerdown', () => {
            if (trace.releasedAt >= 0 && trace.grabbedAt < 0) {
                trace.grabbedAt = trace.samples.length;
            }
        });

        const tick = () => {
            trace.samples.push(handle.getView().centre.x);
            trace.moving.push(handle.isMoving());
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

function readTrace(page: Page): Promise<MotionTrace> {
    return page.evaluate(
        () => (window as unknown as { __motion: MotionTrace }).__motion,
    );
}

/**
 * Dispatch a pointer event on the surface, in surface-local coordinates.
 *
 * Runs inside the page rather than through Playwright's input API. That API
 * cannot pace a drag: `waitForTimeout` between moves costs a round trip whose
 * real duration varies several-fold under load, and the release velocity —
 * distance over the last few tens of milliseconds — varies with it. The
 * resulting flick was anywhere between a fast one and no flick at all.
 *
 * Real input is still exercised, at the same seam, by the click, double-click,
 * and drag tests, which do not depend on how fast it arrives.
 */
const DISPATCH = (
    element: Element,
    args: {
        type: string;
        id: number;
        x: number;
        y: number;
        buttons: number;
    },
) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
        new PointerEvent(args.type, {
            pointerId: args.id,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            // Set explicitly, and NOT left to default to 0: a mouse move with
            // no button held is a hover, and the renderer ends the gesture on
            // one (a lost capture would otherwise leave the pointer stuck
            // down). A synthesized drag has to say it is a drag.
            buttons: args.buttons,
            bubbles: true,
            cancelable: true,
            clientX: rect.left + args.x,
            clientY: rect.top + args.y,
        }),
    );
};

function dispatchPointer(
    page: Page,
    type: string,
    point: { x: number; y: number },
    id = 1,
    buttons = type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
): Promise<void> {
    return page
        .locator(SURFACE)
        .evaluate(DISPATCH, { type, id, x: point.x, y: point.y, buttons });
}

/**
 * A leftward flick — press, eight frame-paced moves, release — and the
 * viewport centre at the instant of release.
 *
 * The release happens in the SAME round trip as the last move. It cannot be a
 * separate call: release velocity is measured over the last few tens of
 * milliseconds, and a round trip can outlast that window entirely, leaving the
 * recogniser a single sample and therefore no velocity at all. That is a
 * property of driving a browser over a socket, not of the renderer.
 */
async function flickLeft(page: Page): Promise<number> {
    return page.locator(SURFACE).evaluate(async (element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer?: RendererHandle;
            }
        ).__triiiceratopsRenderer!;
        const rect = element.getBoundingClientRect();
        const y = rect.height / 2;
        const send = (type: string, x: number) => {
            element.dispatchEvent(
                new PointerEvent(type, {
                    pointerId: 1,
                    pointerType: 'mouse',
                    isPrimary: true,
                    button: 0,
                    buttons: type === 'pointerup' ? 0 : 1,
                    bubbles: true,
                    cancelable: true,
                    clientX: rect.left + x,
                    clientY: rect.top + y,
                }),
            );
        };
        const frame = () =>
            new Promise((resolve) =>
                requestAnimationFrame(() => resolve(undefined)),
            );

        const start = rect.width * 0.8;
        const last = start - 8 * 32;
        send('pointerdown', start);
        for (let step = 1; step <= 8; step += 1) {
            await frame();
            send('pointermove', start - step * 32);
        }

        const atRelease = handle.getView().centre.x;
        send('pointerup', last);
        return atRelease;
    });
}

async function settled(page: Page): Promise<void> {
    await expect
        .poll(
            () =>
                page.locator(SURFACE).evaluate((element) =>
                    (
                        element as HTMLCanvasElement & {
                            __triiiceratopsRenderer?: RendererHandle;
                        }
                    ).__triiiceratopsRenderer!.isMoving(),
                ),
            { timeout: 10_000 },
        )
        .toBe(false);
    await nextPaint(page);
}

test.describe('Canvas2D renderer — gestures', () => {
    test('a flick carries momentum that decays smoothly to a stop', async ({
        page,
    }) => {
        await openGridManifest(page);
        // Parked near the left edge and zoomed well in, so the glide has room
        // to decay to a natural stop. The pan constraint would otherwise cut
        // it off at the world's edge — correct behaviour, but it truncates the
        // very decay curve under test. Zooming in buys room cheaply: the glide
        // is a fixed distance in SCREEN px, so its length in canvas units
        // shrinks with scale while the reachable canvas range does not.
        await setView(page, { centre: { x: 60, y: 450 }, scale: 3 });
        await traceMotion(page);

        const atRelease = await flickLeft(page);
        await settled(page);

        const after = (await getView(page)).centre.x;
        // Dragging left moves the viewport right, and the glide continues in
        // the same direction after the button is up.
        expect(after, 'the release carried no momentum at all').toBeGreaterThan(
            atRelease,
        );

        const trace = await readTrace(page);
        expect(
            trace.releasedAt,
            'the pointer-up never reached the renderer',
        ).toBeGreaterThanOrEqual(0);

        const glide = trace.samples.slice(trace.releasedAt);
        const steps: number[] = [];
        for (let i = 1; i < glide.length; i += 1) {
            steps.push(glide[i] - glide[i - 1]);
        }
        const moved = steps.filter((step) => step > 0.01);

        // It coasted over several frames rather than jumping to a stop…
        expect(
            moved.length,
            `momentum lasted ${moved.length} frame(s): ${steps.slice(0, 8).join(', ')}`,
        ).toBeGreaterThan(2);

        // …and it slowed as it went: friction, not a fixed-length slide.
        //
        // Compared in halves rather than frame against frame. Distance per
        // frame is velocity times FRAME DURATION, and headless frame durations
        // jitter by several-fold, so a short frame legitimately covers less
        // ground than the longer one after it. Summing over half the glide
        // averages the jitter out while still failing outright for constant
        // velocity, which would split the distance evenly.
        const half = Math.floor(moved.length / 2);
        const sum = (steps: number[]) => steps.reduce((a, b) => a + b, 0);
        const early = sum(moved.slice(0, half));
        const late = sum(moved.slice(half));

        expect(
            late,
            `momentum did not decay: ${early.toFixed(1)}px in the first half of the glide, ${late.toFixed(1)}px in the second`,
        ).toBeLessThan(early);

        // And it really stopped, rather than crawling below the poll's notice.
        const tail = trace.samples.slice(-3);
        for (const sample of tail) expect(sample).toBeCloseTo(after, 6);
    });

    test('a pointer-down during momentum stops it in the same frame', async ({
        page,
    }) => {
        await openGridManifest(page);
        await setView(page, { centre: { x: 60, y: 450 }, scale: 3 });
        await traceMotion(page);

        await flickLeft(page);

        // Grabbed after a COUNTED number of animation frames rather than after
        // wall-clock time: whether any frame is sampled inside a
        // `waitForTimeout` depends on the engine's frame pacing, and a grab
        // landing before the first post-release frame leaves nothing to
        // observe. Two frames is far short of the friction's time constant, so
        // the glide is very much still running when the grab lands.
        await page.locator(SURFACE).evaluate(async (element) => {
            const frame = () =>
                new Promise((resolve) =>
                    requestAnimationFrame(() => resolve(undefined)),
                );
            await frame();
            await frame();

            const rect = element.getBoundingClientRect();
            element.dispatchEvent(
                new PointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'mouse',
                    isPrimary: true,
                    button: 0,
                    buttons: 1,
                    bubbles: true,
                    cancelable: true,
                    clientX: rect.left + 200,
                    clientY: rect.top + 200,
                }),
            );
        });

        await settled(page);
        await dispatchPointer(page, 'pointerup', { x: 200, y: 200 });

        const trace = await readTrace(page);
        expect(
            trace.grabbedAt,
            'the re-grab never reached the renderer',
        ).toBeGreaterThanOrEqual(0);
        expect(
            trace.moving.slice(trace.releasedAt, trace.grabbedAt),
            'the flick was not moving when it was grabbed, so this proves nothing',
        ).toContain(true);

        // From the grab onwards nothing moves: momentum is cancelled in the
        // pointer-down handler itself, not on the following frame.
        const held = trace.samples.slice(trace.grabbedAt);
        for (const sample of held) {
            expect(sample).toBeCloseTo(held[0], 6);
        }
    });

    test('pinch scales about the midpoint of the two pointers, 1:1', async ({
        page,
    }) => {
        await openGridManifest(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.5 });

        const before = await getView(page);
        // The midpoint is deliberately off-centre: a viewport-centred
        // implementation would pass a midpoint test taken at the centre.
        const midpoint = {
            x: before.width / 2 - 90,
            y: before.height / 2 + 60,
        };

        // A symmetric spread: separation doubles, midpoint never moves. Both
        // pointers land, then each moves — which is how pointer events actually
        // arrive, one at a time.
        const spread = await page.locator(SURFACE).evaluate((element, mid) => {
            const rect = element.getBoundingClientRect();
            const send = (
                type: string,
                pointerId: number,
                x: number,
                y: number,
            ) => {
                element.dispatchEvent(
                    new PointerEvent(type, {
                        pointerId,
                        pointerType: 'touch',
                        isPrimary: pointerId === 1,
                        bubbles: true,
                        cancelable: true,
                        clientX: rect.left + x,
                        clientY: rect.top + y,
                    }),
                );
            };

            send('pointerdown', 1, mid.x - 80, mid.y);
            send('pointerdown', 2, mid.x + 80, mid.y);
            send('pointermove', 1, mid.x - 160, mid.y);
            send('pointermove', 2, mid.x + 160, mid.y);
            send('pointerup', 1, mid.x - 160, mid.y);
            send('pointerup', 2, mid.x + 160, mid.y);

            return { separationRatio: 320 / 160 };
        }, midpoint);

        await nextPaint(page);
        const after = await getView(page);

        // Scale followed the fingers exactly — 1:1, no easing, no spring.
        expect(after.scale).toBeCloseTo(
            before.scale * spread.separationRatio,
            6,
        );

        // And the world point that was under the midpoint is still under it.
        // Asserted against the PAINTED pixels: the transform and the paint must
        // agree, not merely the transform with itself.
        const world = {
            x: (midpoint.x - before.width / 2) / before.scale + before.centre.x,
            y:
                (midpoint.y - before.height / 2) / before.scale +
                before.centre.y,
        };
        const nowAt = {
            x: (world.x - after.centre.x) * after.scale + after.width / 2,
            y: (world.y - after.centre.y) * after.scale + after.height / 2,
        };
        expect(Math.abs(nowAt.x - midpoint.x)).toBeLessThanOrEqual(0.001);
        expect(Math.abs(nowAt.y - midpoint.y)).toBeLessThanOrEqual(0.001);
    });

    test('a single click produces no viewport change', async ({ page }) => {
        await openGridManifest(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.5 });

        const before = await getView(page);
        const box = (await page.locator(SURFACE).boundingBox())!;
        await page.mouse.click(box.x + box.width / 2 - 70, box.y + 80);
        await settled(page);

        // Single click stays unbound: it is reserved for annotation selection,
        // and binding zoom to it would break the phase-2 drawing layer.
        const after = await getView(page);
        expect(after.scale).toBeCloseTo(before.scale, 10);
        expect(after.centre.x).toBeCloseTo(before.centre.x, 10);
        expect(after.centre.y).toBeCloseTo(before.centre.y, 10);
    });

    test('double-click zooms by 2, animated, anchored at the pointer', async ({
        page,
    }) => {
        await openGridManifest(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.5 });
        await traceMotion(page);

        const before = await getView(page);
        const box = (await page.locator(SURFACE).boundingBox())!;
        const local = { x: before.width / 2 - 110, y: before.height / 2 + 70 };

        // The feature that happens to sit under the cursor is not what is
        // asserted; the world point under it is computed from the model and
        // must not move.
        const world = {
            x: (local.x - before.width / 2) / before.scale + before.centre.x,
            y: (local.y - before.height / 2) / before.scale + before.centre.y,
        };

        await page.mouse.dblclick(box.x + local.x, box.y + local.y);

        // It is ANIMATED: at least one frame lands strictly between the two
        // scales. A snap would put the target in every post-input sample.
        const midFlight = await page.locator(SURFACE).evaluate((element) =>
            (
                element as HTMLCanvasElement & {
                    __triiiceratopsRenderer?: RendererHandle;
                }
            ).__triiiceratopsRenderer!.isMoving(),
        );

        await settled(page);
        const after = await getView(page);

        expect(after.scale).toBeCloseTo(before.scale * 2, 6);
        expect(
            midFlight,
            'the double-click zoom had already finished — it was not animated',
        ).toBe(true);

        const nowAt =
            (world.x - after.centre.x) * after.scale + after.width / 2;
        expect(Math.abs(nowAt - local.x)).toBeLessThanOrEqual(0.001);
    });

    test('zooming out stops at the derived floor', async ({ page }) => {
        await openGridManifest(page);

        const zoomOut = () =>
            page.locator(SURFACE).evaluate(
                (element, anchor) =>
                    (
                        element as HTMLCanvasElement & {
                            __triiiceratopsRenderer?: RendererHandle;
                        }
                    ).__triiiceratopsRenderer!.zoomAt(anchor, 0.25),
                { x: 0, y: 0 },
            );

        // Far more halvings than the range can absorb: if the floor is not
        // enforced this walks the scale to a denormal.
        for (let i = 0; i < 12; i += 1) await zoomOut();
        await settled(page);

        const floor = (await getView(page)).scale;
        expect(floor).toBeGreaterThan(0);

        // Already on the floor: asking for more changes nothing at all.
        await zoomOut();
        await zoomOut();
        await settled(page);
        expect((await getView(page)).scale).toBeCloseTo(floor, 10);

        // The floor is the PLANNER's derived one — the zoom at which a canvas
        // reaches the box threshold — not a tuned fraction of home zoom, so it
        // is well below the whole-world fit rather than at it. The exact value
        // is the planner's to choose and is not asserted here.
        await page.locator(SURFACE).evaluate((element) =>
            (
                element as HTMLCanvasElement & {
                    __triiiceratopsRenderer?: RendererHandle;
                }
            ).__triiiceratopsRenderer!.fit(),
        );
        await settled(page);
        expect(floor).toBeLessThan((await getView(page)).scale);
    });

    // `zoomTo` documents its limits as inescapable. `fitBounds` is a sibling
    // command whose box comes from the CALLER rather than from layout, so it is
    // the one path where a fitted scale is not a home scale — and where a
    // missing clamp lets a plugin put the viewer somewhere the toolbar, the
    // keyboard, and the wheel cannot.
    test('a caller-chosen fit cannot escape the zoom ceiling', async ({
        page,
    }) => {
        await openGridManifest(page);

        // The whole-world fit is the ceiling's reference.
        await page.locator(SURFACE).evaluate((element) =>
            (
                element as HTMLCanvasElement & {
                    __triiiceratopsRenderer?: RendererHandle;
                }
            ).__triiiceratopsRenderer!.fit(),
        );
        await settled(page);
        const home = (await getView(page)).scale;
        expect(home).toBeGreaterThan(0);

        // Two canvas units on a 1200-unit-wide canvas: a fit hundreds of times
        // past the ceiling if nothing clamps it.
        await fitCanvasBounds(page, { x: 0, y: 0, width: 2, height: 2 });
        await settled(page);

        const zoomed = (await getView(page)).scale;
        expect(zoomed).toBeGreaterThan(home);
        expect(zoomed).toBeLessThanOrEqual(home * MAX_ZOOM_FACTOR * 1.001);
    });

    test('the image cannot be dragged off screen', async ({ page }) => {
        await openGridManifest(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.5 });

        const box = (await page.locator(SURFACE).boundingBox())!;
        const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

        // A drag far larger than the viewport, in the worst direction.
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        for (let step = 1; step <= 8; step += 1) {
            await page.mouse.move(start.x - step * 400, start.y - step * 300);
        }
        await page.mouse.up();
        await settled(page);

        // Unconstrained, this would leave a blank viewport with no affordance
        // for getting back. At least one feature must remain findable.
        const visible = await Promise.all([
            findFeature(page, 'alpha'),
            findFeature(page, 'bravo'),
            findFeature(page, 'charlie'),
            findFeature(page, 'delta'),
            findFeature(page, 'echo'),
        ]);
        expect(
            visible.some((feature) => feature !== null),
            'the whole image was dragged off screen',
        ).toBe(true);
    });
    test('a burst of wheel notches lands exactly where the same notches settled one at a time do', async ({
        page,
    }) => {
        await openGridManifest(page);

        // Anchored at the viewport centre so the comparison is about the SCALE
        // the notches accumulate to and nothing else.
        const start = { centre: { x: 600, y: 450 }, scale: 0.5 };
        const notch = (count: number) =>
            page.locator(SURFACE).evaluate((element, n) => {
                const rect = element.getBoundingClientRect();
                for (let i = 0; i < n; i += 1) {
                    element.dispatchEvent(
                        new WheelEvent('wheel', {
                            deltaY: -100,
                            deltaMode: 0,
                            bubbles: true,
                            cancelable: true,
                            clientX: rect.left + rect.width / 2,
                            clientY: rect.top + rect.height / 2,
                        }),
                    );
                }
            }, count);

        // Five notches inside one task: not a single frame of easing happens in
        // between, so every notch sees a scale that has not moved yet. Deltas
        // accumulated against the eased scale rather than the target would all
        // land on top of each other and this would end up one notch deep.
        await setView(page, start);
        await notch(5);
        await settled(page);
        const fast = (await getView(page)).scale;

        // The same five, each allowed to finish first.
        await setView(page, start);
        for (let i = 0; i < 5; i += 1) {
            await notch(1);
            await settled(page);
        }
        const slow = (await getView(page)).scale;

        expect(fast).toBeCloseTo(slow, 6);
        // …and both really zoomed, so equality is not two no-ops agreeing.
        expect(fast).toBeGreaterThan(start.scale * 3);
    });

    test('a drag plans the scene once per frame, never once per pointer event', async ({
        page,
    }) => {
        await openGridManifest(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.5 });

        // A press and eight moves inside ONE task, so no frame can run in the
        // middle: every scene plan counted here would have been built by the
        // input handlers themselves. A plan enumerates the required tile set and
        // allocates a fresh resident-key set, which at pointer rates is hundreds
        // a second — the clamping a pan and a pinch do must not need one.
        const planned = await page.locator(SURFACE).evaluate((element) => {
            const handle = (
                element as HTMLCanvasElement & {
                    __triiiceratopsRenderer?: RendererHandle & {
                        getStats(): { scenePlanCount: number };
                    };
                }
            ).__triiiceratopsRenderer!;
            const rect = element.getBoundingClientRect();
            const send = (type: string, x: number, y: number, held: number) => {
                element.dispatchEvent(
                    new PointerEvent(type, {
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true,
                        button: 0,
                        buttons: held,
                        bubbles: true,
                        cancelable: true,
                        clientX: rect.left + x,
                        clientY: rect.top + y,
                    }),
                );
            };

            const before = handle.getStats().scenePlanCount;
            send('pointerdown', 400, 300, 1);
            for (let step = 1; step <= 8; step += 1) {
                send('pointermove', 400 - step * 12, 300 + step * 9, 1);
            }
            const during = handle.getStats().scenePlanCount;
            send('pointerup', 400 - 8 * 12, 300 + 8 * 9, 0);

            return { before, during };
        });

        expect(
            planned.during - planned.before,
            'the drag built a scene plan per pointer event',
        ).toBe(0);

        await settled(page);
        // The drag still happened, and the frame loop still plans.
        const stats = await getStats(page);
        expect(stats.scenePlanCount).toBeGreaterThan(planned.during);
        expect((await getView(page)).centre.x).toBeGreaterThan(600);
    });

    test('a mouse move with no button held neither pans nor becomes half a pinch', async ({
        page,
    }) => {
        await openGridManifest(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.5 });

        // A drag whose release the renderer never sees: capture lost to a system
        // gesture, a window switch, or a `pointerup` swallowed elsewhere. The
        // browser keeps sending moves, now with no button held.
        await dispatchPointer(page, 'pointerdown', { x: 400, y: 300 });
        await dispatchPointer(page, 'pointermove', { x: 340, y: 300 });
        const dragged = await getView(page);
        expect(dragged.centre.x).toBeGreaterThan(600);

        await dispatchPointer(page, 'pointermove', { x: 200, y: 300 }, 1, 0);
        await dispatchPointer(page, 'pointermove', { x: 100, y: 420 }, 1, 0);
        await nextPaint(page);

        const hovered = await getView(page);
        expect(
            hovered.centre.x,
            'the image panned from a hover — the pointer was stuck down',
        ).toBeCloseTo(dragged.centre.x, 6);
        expect(hovered.centre.y).toBeCloseTo(dragged.centre.y, 6);

        // And the next real press is a fresh PAN, not a second finger: a stuck
        // pointer would make this a pinch and scale the image.
        await dispatchPointer(page, 'pointerdown', { x: 400, y: 300 }, 2);
        await dispatchPointer(page, 'pointermove', { x: 370, y: 300 }, 2);

        // Read before the release, which over a socket is a flick: momentum is
        // a separate behaviour with its own spec, and it would land on top of
        // the delta under test here.
        const after = await getView(page);
        expect(
            after.scale,
            'the press was arbitrated as a pinch — a pointer was still stuck down',
        ).toBeCloseTo(dragged.scale, 10);
        expect(after.centre.x).toBeCloseTo(
            dragged.centre.x + 30 / dragged.scale,
            4,
        );

        await dispatchPointer(page, 'pointerup', { x: 370, y: 300 }, 2);
        await settled(page);
    });

    test('a press during an animated zoom does not freeze it part-way', async ({
        page,
    }) => {
        await openGridManifest(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.5 });

        const before = await getView(page);
        // Press and release without moving, one frame into the animation. A
        // click is not a viewport gesture — it is reserved for annotation
        // selection — so the zoom it interrupted must still arrive.
        const wasMoving = await page.locator(SURFACE).evaluate((element) => {
            const handle = (
                element as HTMLCanvasElement & {
                    __triiiceratopsRenderer?: RendererHandle;
                }
            ).__triiiceratopsRenderer!;
            const rect = element.getBoundingClientRect();
            const send = (type: string, held: number) => {
                element.dispatchEvent(
                    new PointerEvent(type, {
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true,
                        button: 0,
                        buttons: held,
                        bubbles: true,
                        cancelable: true,
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.top + rect.height / 2,
                    }),
                );
            };

            void handle.zoomAt({ x: rect.width / 2, y: rect.height / 2 }, 2);

            return new Promise<boolean>((resolve) => {
                requestAnimationFrame(() => {
                    const moving = handle.isMoving();
                    send('pointerdown', 1);
                    send('pointerup', 0);
                    resolve(moving);
                });
            });
        });

        expect(
            wasMoving,
            'the zoom had already finished, so the press interrupted nothing',
        ).toBe(true);

        await settled(page);
        expect((await getView(page)).scale).toBeCloseTo(before.scale * 2, 6);
    });

    test('a resize re-clamps a centre the new viewport makes illegal', async ({
        page,
    }) => {
        await openGridManifest(page);

        // The test handle writes the viewport RAW, with no constraint — which is
        // how a centre the pan constraint would never have produced gets in.
        // A resize must not leave it there: the constraint depends on the
        // viewport as well as the world, so widening the window can make a legal
        // centre illegal, and nothing else re-runs it.
        await setView(page, { centre: { x: 90_000, y: 60_000 }, scale: 0.5 });

        const size = page.viewportSize()!;
        await page.setViewportSize({
            width: size.width - 120,
            height: size.height - 90,
        });
        await settled(page);

        const after = await getView(page);
        expect(after.centre.x).toBeLessThan(90_000);
        expect(after.centre.y).toBeLessThan(60_000);

        // Polled rather than read once: WebKit takes a repaint or two to catch
        // up with a resized backing store, and the assertion is about where the
        // viewport ended up, not how quickly the engine redraws.
        await expect
            .poll(
                async () => {
                    const visible = await Promise.all([
                        findFeature(page, 'alpha'),
                        findFeature(page, 'bravo'),
                        findFeature(page, 'charlie'),
                        findFeature(page, 'delta'),
                        findFeature(page, 'echo'),
                    ]);
                    return visible.some((feature) => feature !== null);
                },
                {
                    timeout: 10_000,
                    message: 'the resize left the image off screen',
                },
            )
            .toBe(true);
    });
});
