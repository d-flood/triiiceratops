import { test, expect, type Page } from '@playwright/test';

import {
    getView,
    nextPaint,
    openGridManifest,
    setView,
} from './helpers/numberedGrid';

/*
 * Explicit keyboard-operability journeys (ticket 23). These assert behaviors
 * axe cannot: tab reachability, panel/flyout/dialog open-operate-close by
 * keyboard, Escape closing with focus return to the invoker, listbox arrow
 * operation, and aria-activedescendant. Serial (single worker) so the shared
 * dev server isn't overwhelmed; CI runs workers=1 regardless.
 */

test.describe.configure({ mode: 'serial' });

// Desktop viewer only (the Select journey uses the desktop settings sidebar);
// ticket 24 owns the mobile browser matrix.
test.beforeEach(({ isMobile }) => {
    test.skip(!!isMobile, 'a11y suite targets the desktop viewer (chromium)');
});

const MANIFEST = '/demo-manifests/a11y/manifest.json';

async function loadViewer(page: Page): Promise<void> {
    // Generous timeout: the first load after a cold dev-server start compiles
    // the whole app before the toolbar appears.
    await page.goto(`/?manifest=${MANIFEST}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });
    await page
        .locator('[aria-controls="tri-flyout-viewing-mode"]')
        .first()
        .waitFor({ timeout: 60000 });
    await page.waitForTimeout(300);
}

/** Accessible name / role of the deeply-focused element (pierces shadow roots). */
async function activeElementInfo(
    page: Page,
): Promise<{ label: string | null; role: string | null; tag: string | null }> {
    return page.evaluate(() => {
        let el: Element | null = document.activeElement;
        while (el && el.shadowRoot && el.shadowRoot.activeElement) {
            el = el.shadowRoot.activeElement;
        }
        return {
            label: el?.getAttribute('aria-label') ?? null,
            role: el?.getAttribute('role') ?? null,
            tag: el?.tagName?.toLowerCase() ?? null,
        };
    });
}

test('toolbar buttons are keyboard-focusable and Enter-operable', async ({
    page,
}) => {
    test.slow();
    await loadViewer(page);
    const info = page.locator('[aria-label="Toggle Information"]');
    await info.focus();
    expect((await activeElementInfo(page)).label).toBe('Toggle Information');
    expect(await info.getAttribute('aria-pressed')).toBe('false');

    await page.keyboard.press('Enter');
    await expect(info).toHaveAttribute('aria-pressed', 'true');
    await expect(
        page.getByRole('dialog', { name: 'Information' }),
    ).toBeVisible();

    // Toolbar toggles are reachable by Tab (they are real buttons in DOM order).
    await info.focus();
    const labels: (string | null)[] = [];
    for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        labels.push((await activeElementInfo(page)).label);
    }
    // At least one other toolbar control is reached by tabbing forward.
    expect(labels.some((l) => l && l !== 'Toggle Information')).toBe(true);
});

test('panel closes on Escape and returns focus to its toolbar toggle', async ({
    page,
}) => {
    await loadViewer(page);
    const info = page.locator('[aria-label="Toggle Information"]');
    await info.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Information' });
    await expect(dialog).toBeVisible();

    // Move focus into the panel (its close button), then press Escape.
    const close = page
        .locator('[data-panel-id="metadata"]')
        .getByRole('button', { name: 'Close' });
    await close.focus();
    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    // Focus returned to the invoking toolbar toggle.
    expect((await activeElementInfo(page)).label).toBe('Toggle Information');
});

test('panel close button returns focus to its toolbar toggle', async ({
    page,
}) => {
    await loadViewer(page);
    const info = page.locator('[aria-label="Toggle Information"]');
    await info.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Information' });
    await expect(dialog).toBeVisible();

    await page
        .locator('[data-panel-id="metadata"]')
        .getByRole('button', { name: 'Close' })
        .click();

    await expect(dialog).toBeHidden();
    expect((await activeElementInfo(page)).label).toBe('Toggle Information');
});

test('flyout menu opens, moves focus, arrow-navigates, and Escape returns focus', async ({
    page,
}) => {
    await loadViewer(page);
    const toggle = page.locator('[aria-controls="tri-flyout-viewing-mode"]');
    await toggle.focus();

    // Open with keyboard; focus moves into the menu (a menuitemradio).
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect
        .poll(async () => (await activeElementInfo(page)).role)
        .toBe('menuitemradio');
    let active = await activeElementInfo(page);

    // Arrow keys rove focus within the menu.
    await page.keyboard.press('ArrowDown');
    active = await activeElementInfo(page);
    expect(active.role).toBe('menuitemradio');

    // Escape closes the flyout and returns focus to the toggle.
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect((await activeElementInfo(page)).label).toBe('Viewing Mode');
});

test('structures panel closes on Escape and returns focus to its toolbar toggle', async ({
    page,
}) => {
    await loadViewer(page);
    const toggle = page.locator('[aria-label="Toggle Table of Contents"]');
    await toggle.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Table of Contents' });
    await expect(dialog).toBeVisible();

    await page
        .locator('[data-panel-id="structures"]')
        .getByRole('button', { name: 'Close' })
        .focus();
    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    expect((await activeElementInfo(page)).label).toBe(
        'Toggle Table of Contents',
    );
});

test('core Select (listbox) operates with keyboard and exposes aria-activedescendant', async ({
    page,
}) => {
    await loadViewer(page);

    // The core ui/Select renders in the demo settings sidebar (visible at
    // desktop width). Expand the Nav group and drive its combobox. Scope to the
    // desktop sidebar so the mobile-only duplicate menu is not matched.
    const sidebar = page.locator('.settings-sidebar');
    // Expand the <details> group that holds the select (programmatically, to
    // avoid flaky summary-click stability with the group's expand animation).
    await page.evaluate(() => {
        const sb = document.querySelector('.settings-sidebar');
        const sel = sb?.querySelector('#controls-select');
        const details = sel?.closest('details');
        if (details) (details as HTMLDetailsElement).open = true;
    });
    const combobox = sidebar.locator('#controls-select ~ [role="combobox"]');
    await combobox.scrollIntoViewIfNeeded();
    await combobox.focus();
    expect(await combobox.getAttribute('aria-expanded')).toBe('false');

    // Open with ArrowDown; listbox becomes visible and activedescendant is set.
    await page.keyboard.press('ArrowDown');
    await expect(combobox).toHaveAttribute('aria-expanded', 'true');
    const ad1 = await combobox.getAttribute('aria-activedescendant');
    expect(ad1).toBeTruthy();

    // Arrow moves the active option (activedescendant tracks the highlight).
    await page.keyboard.press('ArrowDown');
    await expect(combobox).toHaveAttribute('aria-activedescendant', /.+/);

    // Enter selects and closes.
    await page.keyboard.press('Enter');
    await expect(combobox).toHaveAttribute('aria-expanded', 'false');
});

/*
 * The Canvas2D renderer's keyboard model (ticket 11).
 *
 * The image surface is a new tab stop, and it is the ONLY place in the viewer
 * where an arrow key moves the picture rather than roving focus. Both halves of
 * that are asserted here: that the bindings work when the surface has focus,
 * and that nothing binds when it does not.
 *
 * These select the first-party renderer per test (`openGridManifest`), so the
 * journeys above keep exercising the shipping renderer in the same run.
 */

const SURFACE = '[data-testid="canvas-renderer-root"]';

interface RendererHandle {
    getView(): { centre: { x: number; y: number }; scale: number };
    isMoving(): boolean;
}

/*
 * NOTE on the `page.evaluate` bodies below: each looks the renderer's test
 * handle up inline rather than calling a shared helper. Everything inside an
 * `evaluate` is serialized and run in the browser, where this file's module
 * scope does not exist and a function argument cannot be passed.
 */

/** Wait until the viewport has stopped moving, then for the frame that paints it. */
async function settled(page: Page): Promise<void> {
    await expect
        .poll(
            () =>
                page.locator(SURFACE).evaluate((element) =>
                    (
                        element.querySelector('canvas') as HTMLCanvasElement & {
                            __triiiceratopsRenderer: RendererHandle;
                        }
                    ).__triiiceratopsRenderer.isMoving(),
                ),
            { timeout: 10_000 },
        )
        .toBe(false);
    await nextPaint(page);
}

/**
 * Sample the viewport centre once per animation frame while a key is held.
 *
 * Per FRAME, from inside the page, for the same reason the momentum trace is:
 * a polled assertion cannot see a rate. One round trip per sample takes longer
 * than the whole hold, so a steady glide and a single jump would look alike —
 * and telling those two apart is the entire point of the velocity model.
 */
async function traceHeldKey(
    page: Page,
    key: string,
    holdMs: number,
): Promise<number[]> {
    await page.locator(SURFACE).evaluate((element) => {
        const handle = (
            element.querySelector('canvas') as HTMLCanvasElement & {
                __triiiceratopsRenderer: RendererHandle;
            }
        ).__triiiceratopsRenderer;
        const samples: number[] = [];
        (window as unknown as { __keySamples: number[] }).__keySamples =
            samples;
        const tick = () => {
            samples.push(handle.getView().centre.x);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });

    // `down` then `up`, NOT `press`: a held key drives a velocity for as long
    // as it is down (spec §Keyboard). Playwright sends exactly one keydown and
    // never repeats it, so an implementation that panned a fixed step per
    // key-down event would move once and then sit still — which is precisely
    // what the rate assertions below reject.
    await page.locator(SURFACE).focus();
    await page.keyboard.down(key);
    await page.waitForTimeout(holdMs);
    await page.keyboard.up(key);

    return page.evaluate(
        () => (window as unknown as { __keySamples: number[] }).__keySamples,
    );
}

test.describe('Canvas2D renderer — keyboard', () => {
    test('the image surface is a named tab stop with a visible focus ring', async ({
        page,
    }) => {
        test.slow();
        await openGridManifest(page);

        // Reached by TAB rather than by `.focus()`: an element can be
        // programmatically focusable and still sit outside the sequential tab
        // order, which is exactly the state the previous renderer was in.
        // Stepping back and forward proves it participates in that order.
        await page.locator(SURFACE).focus();
        await page.keyboard.press('Shift+Tab');
        expect((await activeElementInfo(page)).label).not.toBe(
            await page.locator(SURFACE).getAttribute('aria-label'),
        );

        await page.keyboard.press('Tab');
        const active = await activeElementInfo(page);
        expect(active.role).toBe('application');
        expect(
            active.label,
            'the image surface has no accessible name',
        ).toBeTruthy();

        // …and the keyboard is visible on it. `:focus-visible` is why the tab
        // above matters: a programmatic focus would not necessarily set it.
        const ring = await page.locator(SURFACE).evaluate((element) => {
            const style = getComputedStyle(element);
            return {
                width: parseFloat(style.outlineWidth),
                style: style.outlineStyle,
                color: style.outlineColor,
            };
        });
        expect(ring.style, 'no focus ring on the image surface').not.toBe(
            'none',
        );
        expect(ring.width).toBeGreaterThan(0);
    });

    test('holding an arrow key pans at a steady rate, with no acceleration', async ({
        page,
    }) => {
        test.slow();
        await openGridManifest(page);
        // Zoomed in and parked left, so panning right has room to run without
        // meeting the pan constraint — which would truncate the very rate
        // under test.
        await setView(page, { centre: { x: 200, y: 450 }, scale: 3 });

        const samples = await traceHeldKey(page, 'ArrowRight', 500);

        const steps: number[] = [];
        for (let i = 1; i < samples.length; i += 1) {
            steps.push(samples[i] - samples[i - 1]);
        }
        const moved = steps.filter((step) => step > 1e-6);

        // It panned across MANY frames from a single key-down — a discrete
        // step per key event would have produced exactly one.
        expect(
            moved.length,
            `the hold panned on ${moved.length} frame(s): ${steps.slice(0, 8).join(', ')}`,
        ).toBeGreaterThan(4);

        // …and at a steady rate. Summed in halves rather than compared frame
        // by frame: distance per frame is velocity times FRAME DURATION, and
        // headless frame pacing jitters several-fold. The failure this rejects
        // is unmissable at that resolution — OS key repeat compounding into a
        // spring accelerates without bound.
        const half = Math.floor(moved.length / 2);
        const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
        const early = sum(moved.slice(0, half));
        const late = sum(moved.slice(half));

        expect(
            late,
            `held-key panning accelerated: ${early.toFixed(1)}px in the first half, ${late.toFixed(1)}px in the second`,
        ).toBeLessThan(early * 1.5);
    });

    test('+/- zoom and 0 fits, only when the surface has focus', async ({
        page,
    }) => {
        test.slow();
        await openGridManifest(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 1 });

        await page.locator(SURFACE).focus();
        await page.keyboard.press('+');
        await settled(page);
        const zoomedIn = (await getView(page)).scale;
        expect(zoomedIn).toBeGreaterThan(1);

        await page.keyboard.press('-');
        await settled(page);
        expect((await getView(page)).scale).toBeLessThan(zoomedIn);

        // `0` fits the world — a different scale from where we left it, and
        // the same one `Home` reaches.
        await setView(page, { centre: { x: 600, y: 450 }, scale: 4 });
        await page.keyboard.press('0');
        await settled(page);
        const fitted = await getView(page);
        expect(fitted.scale).toBeLessThan(4);

        await setView(page, { centre: { x: 600, y: 450 }, scale: 4 });
        await page.keyboard.press('Home');
        await settled(page);
        expect((await getView(page)).scale).toBeCloseTo(fitted.scale, 6);

        // Focus elsewhere: the bindings are scoped to the surface, so nothing
        // in the viewer chrome moves the viewport.
        await page.locator('[aria-label="Toggle Information"]').first().focus();
        const before = await getView(page);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('+');
        await page.waitForTimeout(200);
        const after = await getView(page);
        expect(after.scale).toBeCloseTo(before.scale, 6);
        expect(after.centre.x).toBeCloseTo(before.centre.x, 6);
    });
});
