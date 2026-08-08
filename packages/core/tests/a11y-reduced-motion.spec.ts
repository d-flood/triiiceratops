import { test, expect, type Page } from '@playwright/test';

import { getView, openGridManifest, setView } from './helpers/numberedGrid';

/*
 * Reduced-motion support (ticket 23 / WCAG 2.3.3). With
 * `prefers-reduced-motion: reduce` emulated, the global guard in base.css must
 * neutralize CSS transition/animation durations for viewer chrome. We assert
 * computed styles rather than observing motion.
 */

test.use({ colorScheme: 'light' });

// Desktop viewer only; ticket 24 owns the mobile browser matrix.
test.beforeEach(({ isMobile }) => {
    test.skip(!!isMobile, 'a11y suite targets the desktop viewer (chromium)');
});

const MANIFEST = '/demo-manifests/a11y/manifest.json';

test('viewer chrome has no CSS transitions/animations under reduced motion', async ({
    page,
}) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?manifest=${MANIFEST}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });

    const toggle = page.locator('[aria-controls="tri-flyout-viewing-mode"]');
    await toggle.first().waitFor({ timeout: 60000 });

    // Sample several transition-bearing chrome elements and assert their
    // effective transition + animation durations are ~zero.
    const durations = await page.evaluate(() => {
        const root = document
            .querySelector('triiiceratops-viewer')
            ?.shadowRoot?.querySelector('.viewer-root');
        // `.osd-root` is OSDViewer's wrapper (renamed from `viewer-root`, which
        // is now reserved for the single viewer root queried above).
        const selectors = ['.osd-root', 'button', '[data-flyout-panel]'];
        const seen: { sel: string; transition: string; animation: string }[] =
            [];
        const scope: ParentNode = root ?? document;
        for (const sel of selectors) {
            const el = scope.querySelector(sel);
            if (!el) continue;
            const cs = getComputedStyle(el as Element);
            seen.push({
                sel,
                transition: cs.transitionDuration,
                animation: cs.animationDuration,
            });
        }
        return seen;
    });

    expect(durations.length).toBeGreaterThan(0);
    const toMs = (v: string): number =>
        Math.max(
            0,
            ...v.split(',').map((p) => {
                const t = p.trim();
                return t.endsWith('ms')
                    ? parseFloat(t)
                    : parseFloat(t) * 1000 || 0;
            }),
        );
    for (const d of durations) {
        expect(
            toMs(d.transition),
            `${d.sel} transition-duration=${d.transition}`,
        ).toBeLessThanOrEqual(1);
        expect(
            toMs(d.animation),
            `${d.sel} animation-duration=${d.animation}`,
        ).toBeLessThanOrEqual(1);
    }
});

test('transitions are present WITHOUT the reduced-motion preference', async ({
    page,
}) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`/?manifest=${MANIFEST}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });
    await page
        .locator('[aria-controls="tri-flyout-viewing-mode"]')
        .first()
        .waitFor({ timeout: 60000 });

    // Control assertion: at least one chrome button animates when motion is
    // allowed, proving the reduced-motion test above is meaningful.
    const anyTransition = await page.evaluate(() => {
        const root = document
            .querySelector('triiiceratops-viewer')
            ?.shadowRoot?.querySelector('.viewer-root');
        const scope: ParentNode = root ?? document;
        const buttons = Array.from(scope.querySelectorAll('button'));
        return buttons.some((b) => {
            const d = getComputedStyle(b).transitionDuration;
            return d.split(',').some((p) => parseFloat(p) > 0);
        });
    });
    expect(anyTransition).toBe(true);
});

/*
 * Reduced motion, observed at the VIEWPORT (ticket 11).
 *
 * The two tests above read computed CSS, and they cannot detect the gap they
 * exist to prevent: the viewport's easing is JS-driven, so a wheel zoom, a
 * programmatic fit, and flick momentum all pass straight through the global
 * `@media (prefers-reduced-motion: reduce)` guard untouched. These assert the
 * motion itself — that under the preference the viewport arrives rather than
 * travels — and carry a control that proves the assertion is meaningful.
 */

const SURFACE = '[data-testid="canvas-renderer-surface"]';

interface RendererHandle {
    getView(): { centre: { x: number; y: number }; scale: number };
    fit(): Promise<void>;
    isMoving(): boolean;
    nextPaint(): Promise<void>;
}

/**
 * Start a whole-world fit and report the viewport in the SAME task.
 *
 * The distinction under test is one frame wide, so it cannot be observed
 * across a round trip: `fit()` is called and the view read without awaiting
 * anything. Instant means the view has already arrived here; animated means it
 * has not moved yet and the renderer says it is in motion.
 */
async function fitAndSampleImmediately(page: Page): Promise<{
    before: number;
    immediate: number;
    moving: boolean;
    settled: number;
}> {
    return page.locator(SURFACE).evaluate(async (element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer: RendererHandle;
            }
        ).__triiiceratopsRenderer;

        const before = handle.getView().scale;
        const done = handle.fit();
        const immediate = handle.getView().scale;
        const moving = handle.isMoving();
        await done;
        return { before, immediate, moving, settled: handle.getView().scale };
    });
}

/** A leftward flick, and the viewport centre at the instant of release. */
async function flickLeft(page: Page): Promise<number> {
    return page.locator(SURFACE).evaluate(async (element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer: RendererHandle;
            }
        ).__triiiceratopsRenderer;
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
        send('pointerdown', start);
        for (let step = 1; step <= 8; step += 1) {
            await frame();
            send('pointermove', start - step * 32);
        }

        const atRelease = handle.getView().centre.x;
        send('pointerup', start - 8 * 32);
        return atRelease;
    });
}

test('the viewport does not animate under reduced motion', async ({ page }) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGridManifest(page);
    await setView(page, { centre: { x: 600, y: 450 }, scale: 1 });

    // A wheel zoom: animated with a short time constant when motion is
    // allowed, instant here. Read straight after the event, with no frame in
    // between.
    const zoom = await page.locator(SURFACE).evaluate((element) => {
        const handle = (
            element as HTMLCanvasElement & {
                __triiiceratopsRenderer: RendererHandle;
            }
        ).__triiiceratopsRenderer;
        const rect = element.getBoundingClientRect();
        const before = handle.getView().scale;
        element.dispatchEvent(
            new WheelEvent('wheel', {
                deltaY: -240,
                deltaMode: 0,
                bubbles: true,
                cancelable: true,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2,
            }),
        );
        return {
            before,
            immediate: handle.getView().scale,
            moving: handle.isMoving(),
        };
    });

    expect(
        zoom.immediate,
        'the wheel notch did not zoom at all',
    ).toBeGreaterThan(zoom.before);
    expect(
        zoom.moving,
        'the wheel zoom was still easing towards its target',
    ).toBe(false);

    // A programmatic fit — the other animated path — is likewise complete
    // before the frame that would have eased it.
    await setView(page, { centre: { x: 600, y: 450 }, scale: 4 });
    const fit = await fitAndSampleImmediately(page);
    expect(fit.immediate, 'the fit did not happen').not.toBeCloseTo(
        fit.before,
        6,
    );
    expect(fit.immediate, 'the fit eased instead of arriving').toBeCloseTo(
        fit.settled,
        6,
    );
    expect(fit.moving).toBe(false);

    // And a flick coasts nowhere: the drag itself is direct and unaffected,
    // but the release carries no momentum.
    await setView(page, { centre: { x: 600, y: 450 }, scale: 3 });
    const atRelease = await flickLeft(page);
    await page.waitForTimeout(400);
    const after = (await getView(page)).centre.x;
    expect(
        after,
        'the release carried momentum despite reduced motion',
    ).toBeCloseTo(atRelease, 6);
});

test('the viewport DOES animate without the reduced-motion preference', async ({
    page,
}) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openGridManifest(page);

    // The control for the test above: the same programmatic fit, read at the
    // same instant, has NOT arrived — so "arrived immediately" is a real
    // observation rather than a vacuous one.
    await setView(page, { centre: { x: 600, y: 450 }, scale: 4 });
    const fit = await fitAndSampleImmediately(page);

    expect(fit.moving, 'the fit was not animating at all').toBe(true);
    expect(fit.immediate, 'the fit arrived in one frame').toBeCloseTo(
        fit.before,
        6,
    );
    expect(fit.settled).not.toBeCloseTo(fit.before, 6);
});
