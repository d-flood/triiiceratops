import { test, expect, type Page } from '@playwright/test';

import {
    getView,
    nextPaint,
    openGridManifest,
    setView,
} from './helpers/numberedGrid';

/*
 * Explicit keyboard-operability journeys. These assert behaviors
 * axe cannot: tab reachability, panel/flyout/dialog open-operate-close by
 * keyboard, Escape closing with focus return to the invoker, listbox arrow
 * operation, and aria-activedescendant. Serial (single worker) so the shared
 * dev server isn't overwhelmed; CI runs workers=1 regardless.
 */

test.describe.configure({ mode: 'serial' });

// Desktop viewer only (the Select journey uses the desktop settings sidebar).
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

/*
 * Parity rule: a PLUGIN's docked panel gets the same close affordance the two
 * core-panel journeys above assert. Exercised through the demo's real SDK
 * plugin (`@triiiceratops/plugin-pdf-export`, a `target: 'panel'` plugin), so
 * this is the shipped chrome and not a double.
 *
 * Two of them dock the plugin RIGHT, matching the right-docked Information
 * panel the core journeys use: the toggle is never rebuilt, so focus return is
 * the simple case. The third exercises the DEFAULT plugin configuration —
 * docked LEFT, on the same side as the demo's toolbar rail, where opening the
 * panel re-lays-out the rail and recreates the toggle element. A panel there
 * finds its toggle again by identity (`data-panel-toggle`) rather than by the
 * node it saw at mount.
 */
const PLUGIN_TOGGLE = '[aria-label="PDF Export"]';
const PLUGIN_PANEL = '[data-panel-id="pdf-export:panel"]';

/** Load the demo, dock the PDF-export plugin right, and open it from its toggle. */
async function openPluginPanel(page: Page) {
    await loadViewer(page);
    await page.evaluate(() => {
        const host = document.querySelector(
            'triiiceratops-viewer',
        ) as unknown as {
            viewerState: { setPluginPosition(id: string, p: string): void };
        };
        host.viewerState.setPluginPosition('pdf-export', 'right');
    });

    const toggle = page.locator(PLUGIN_TOGGLE).first();
    await toggle.focus();
    await page.keyboard.press('Enter');

    const panel = page.locator(PLUGIN_PANEL);
    await expect(panel).toBeVisible();
    // `setPluginPosition` silently no-ops for an unregistered id, which would
    // leave the panel on its default LEFT side and quietly turn these journeys
    // into the untested left-docked case. Assert the dock actually took.
    await expect(page.locator(`.side-col-right ${PLUGIN_PANEL}`)).toBeVisible();
    return panel;
}

test('plugin panel close button closes it and returns focus to its toolbar toggle', async ({
    page,
}) => {
    const panel = await openPluginPanel(page);

    // The affordance a reader was missing: a close button in the panel header.
    await panel.getByRole('button', { name: 'Close' }).click();

    await expect(panel).toHaveCount(0);
    expect((await activeElementInfo(page)).label).toBe('PDF Export');
});

test('plugin panel closes on Escape and returns focus to its toolbar toggle', async ({
    page,
}) => {
    const panel = await openPluginPanel(page);

    // Escape-to-close comes free from PanelStackSection once `close` is passed;
    // pressed with focus inside the panel, as a reader would.
    await panel.getByRole('button', { name: 'Close' }).focus();
    await page.keyboard.press('Escape');

    await expect(panel).toHaveCount(0);
    expect((await activeElementInfo(page)).label).toBe('PDF Export');
});

test('LEFT-docked plugin panel (the default) closes on Escape and returns focus to its rebuilt toggle', async ({
    page,
}) => {
    await loadViewer(page);

    const toggle = page.locator(PLUGIN_TOGGLE).first();
    await toggle.focus();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter');

    const panel = page.locator(PLUGIN_PANEL);
    await expect(panel).toBeVisible();
    // The default position, on the toolbar rail's own side — no reconfiguration.
    await expect(page.locator(`.side-col-left ${PLUGIN_PANEL}`)).toBeVisible();
    // Addressable by role and name, the way a core panel is — and the name has
    // to cover the header, or the panel's "Close" button is still just one of
    // several identically named buttons on the page.
    const dialog = page.getByRole('dialog', { name: 'PDF Export' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();
    // The rail hand-off invariant: exactly one toolbar, before and after.
    await expect(page.locator('.toolbar-root')).toHaveCount(1);
    await expect(page.locator(PLUGIN_TOGGLE).first()).toHaveAttribute(
        'aria-pressed',
        'true',
    );

    // Escape immediately: opening a left-docked panel destroys the toggle the
    // reader activated, so the panel takes focus and Escape reaches it without
    // tabbing in first.
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);

    // Polled past the rail→floating hand-off, which trails the column's close
    // animation: focus has to survive the toolbar being rebuilt a second time,
    // and reading once mid-animation reads a toolbar that is still swapping.
    await expect
        .poll(async () => (await activeElementInfo(page)).label)
        .toBe('PDF Export');
    await expect(page.locator('.toolbar-root')).toHaveCount(1);
    await expect(page.locator(PLUGIN_TOGGLE).first()).toHaveAttribute(
        'aria-pressed',
        'false',
    );
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
 * The Canvas2D renderer's keyboard model.
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

/** One per-frame observation of the viewport during a keyboard gesture. */
interface KeySample {
    /** Page time, for rates. */
    t: number;
    /** Viewport centre x, in canvas space. */
    x: number;
    /** The scale it was sampled at, to convert that back to screen px. */
    scale: number;
}

/**
 * Sample the viewport once per animation frame while `hold` drives the
 * keyboard.
 *
 * Per FRAME, from inside the page, for the same reason the momentum trace is:
 * a polled assertion cannot see a rate. One round trip per sample takes longer
 * than the whole hold, so a steady glide and a single jump would look alike —
 * and telling those two apart is the entire point of the velocity model.
 *
 * The loop is STOPPED when `hold` returns. A self-perpetuating `rAF` left
 * running would go on sampling into the next gesture, and a second call in the
 * same test would then be reading a trace two loops were appending to.
 */
async function traceKeys(
    page: Page,
    hold: () => Promise<void>,
): Promise<KeySample[]> {
    await page.locator(SURFACE).evaluate((element) => {
        const handle = (
            element.querySelector('canvas') as HTMLCanvasElement & {
                __triiiceratopsRenderer: RendererHandle;
            }
        ).__triiiceratopsRenderer;
        const trace = { samples: [] as KeySample[], running: true };
        (window as unknown as { __keyTrace: typeof trace }).__keyTrace = trace;
        const tick = () => {
            if (!trace.running) return;
            const view = handle.getView();
            trace.samples.push({
                t: performance.now(),
                x: view.centre.x,
                scale: view.scale,
            });
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });

    await page.locator(SURFACE).focus();
    await hold();

    return page.evaluate(() => {
        const trace = (
            window as unknown as {
                __keyTrace: { samples: KeySample[]; running: boolean };
            }
        ).__keyTrace;
        trace.running = false;
        return trace.samples;
    });
}

/**
 * Hold one key down for `holdMs`.
 *
 * `down` then `up`, NOT `press`: a held key drives a velocity for as long as
 * it is down (spec §Keyboard). Playwright sends exactly one keydown and never
 * repeats it, so an implementation that panned a fixed step per key-down event
 * would move once and then sit still — which is precisely what the rate
 * assertions reject.
 */
function holdKey(page: Page, key: string, holdMs: number): () => Promise<void> {
    return async () => {
        await page.keyboard.down(key);
        await page.waitForTimeout(holdMs);
        await page.keyboard.up(key);
    };
}

/**
 * The typical pan rate across a trace, in SCREEN px/s — the unit the velocity
 * model is expressed in, so the number is comparable with `KEY_PAN_SPEED`
 * whatever the zoom.
 *
 * A median rather than a mean over the whole span: the first and last frames
 * of a hold are partial (the key lands mid-frame), and headless frame pacing
 * jitters several-fold. The median is unmoved by either, and by the short
 * momentum tail after release — which begins at the held speed anyway.
 */
function medianPanRate(samples: KeySample[]): number {
    const rates: number[] = [];
    for (let i = 1; i < samples.length; i += 1) {
        const seconds = (samples[i].t - samples[i - 1].t) / 1000;
        if (seconds <= 0) continue;
        const screenPx =
            Math.abs(samples[i].x - samples[i - 1].x) * samples[i].scale;
        // Frames where nothing moved are not slow panning; they are not
        // panning, and averaging them in would report the duty cycle rather
        // than the rate.
        if (screenPx / seconds < 1) continue;
        rates.push(screenPx / seconds);
    }
    if (rates.length === 0) return 0;
    rates.sort((a, b) => a - b);
    return rates[Math.floor(rates.length / 2)];
}

/** Page time now, to split one trace into before/after a mid-hold event. */
function pageNow(page: Page): Promise<number> {
    return page.evaluate(() => performance.now());
}

/**
 * Samples strictly inside one side of a mid-hold marker.
 *
 * The margin discards the frames around it: the marker is read over a round
 * trip, so a frame either side of it may have been integrated under either
 * régime, and the transition frame itself always is.
 */
function samplesBefore(samples: KeySample[], marker: number): KeySample[] {
    return samples.filter((sample) => sample.t < marker - 40);
}

function samplesAfter(samples: KeySample[], marker: number): KeySample[] {
    return samples.filter((sample) => sample.t > marker + 40);
}

/** Whether the renderer reports itself in motion right now. */
function isMoving(page: Page): Promise<boolean> {
    return page.locator(SURFACE).evaluate((element) =>
        (
            element.querySelector('canvas') as HTMLCanvasElement & {
                __triiiceratopsRenderer: RendererHandle;
            }
        ).__triiiceratopsRenderer.isMoving(),
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
        // order. Stepping back and forward proves it participates in that
        // order.
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
        //
        // Asserted as THIS ring, not merely as some ring. Chromium's UA default
        // is `outline: auto 1px`, which satisfies "an outline exists" on its
        // own — so a shape-free assertion would stay green with the whole
        // `:focus-visible` rule deleted. Both bands are checked, because the
        // ring is two-tone by design: drawn inside the surface its neighbour is
        // arbitrary image pixels, and it is the two bands' contrast with each
        // other that makes it visible over them.
        //
        // The expected colours are resolved from the TOKENS in the page, so
        // this stays true in every theme rather than pinning one palette's hex.
        const ring = await page.locator(SURFACE).evaluate((element) => {
            const style = getComputedStyle(element);
            const inner = getComputedStyle(element, '::after');

            // Token → the same `rgb(...)` form `getComputedStyle` reports, by
            // asking the engine to resolve it in this element's own context.
            const resolve = (token: string) => {
                const probe = document.createElement('span');
                probe.style.color = style.getPropertyValue(token).trim();
                element.append(probe);
                const resolved = getComputedStyle(probe).color;
                probe.remove();
                return resolved;
            };

            return {
                width: parseFloat(style.outlineWidth),
                style: style.outlineStyle,
                color: style.outlineColor,
                innerShadow: inner.boxShadow,
                expectedOuter: resolve('--tri-color-primary-text'),
                expectedInner: resolve('--tri-viewer-bg'),
            };
        });

        expect(ring.style, 'no focus ring on the image surface').not.toBe(
            'none',
        );
        // 3px, not the UA's 1px: there is no gap between ring and content here.
        expect(ring.width).toBeGreaterThanOrEqual(3);
        expect(ring.color, 'the focus ring is not the themed one').toBe(
            ring.expectedOuter,
        );
        expect(
            ring.innerShadow,
            'the focus ring has no second band to contrast against the image',
        ).toContain(ring.expectedInner);
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

        const samples = await traceKeys(page, holdKey(page, 'ArrowRight', 500));

        const steps: number[] = [];
        for (let i = 1; i < samples.length; i += 1) {
            steps.push(samples[i].x - samples[i - 1].x);
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

    test('Shift+arrow pans further, whenever Shift arrives or leaves', async ({
        page,
    }) => {
        test.slow();
        await openGridManifest(page);
        await setView(page, { centre: { x: 150, y: 450 }, scale: 3 });

        const plain = medianPanRate(
            await traceKeys(page, holdKey(page, 'ArrowRight', 350)),
        );

        // Shift held FIRST, the ordinary way.
        await setView(page, { centre: { x: 150, y: 450 }, scale: 3 });
        const shifted = medianPanRate(
            await traceKeys(page, async () => {
                await page.keyboard.down('Shift');
                await page.keyboard.down('ArrowRight');
                await page.waitForTimeout(350);
                await page.keyboard.up('ArrowRight');
                await page.keyboard.up('Shift');
            }),
        );

        expect(plain, 'the unmodified hold did not pan').toBeGreaterThan(100);
        expect(
            shifted,
            `Shift+arrow did not pan further: ${plain.toFixed(0)} px/s plain, ${shifted.toFixed(0)} px/s shifted`,
        ).toBeGreaterThan(plain * 2);

        // Shift pressed SECOND, mid-hold. Shift is tracked separately from the
        // arrows precisely so this works; without that the modifier would only
        // be read off the arrow's own key-down and a late Shift would do
        // nothing.
        await setView(page, { centre: { x: 150, y: 450 }, scale: 3 });
        let marker = 0;
        const late = await traceKeys(page, async () => {
            await page.keyboard.down('ArrowRight');
            await page.waitForTimeout(300);
            marker = await pageNow(page);
            await page.keyboard.down('Shift');
            await page.waitForTimeout(300);
            await page.keyboard.up('ArrowRight');
            await page.keyboard.up('Shift');
        });

        const beforeShift = medianPanRate(samplesBefore(late, marker));
        const afterShift = medianPanRate(samplesAfter(late, marker));
        expect(
            afterShift,
            `Shift pressed mid-hold did not speed the pan up: ${beforeShift.toFixed(0)} → ${afterShift.toFixed(0)} px/s`,
        ).toBeGreaterThan(beforeShift * 2);

        // …and released FIRST, with the arrow still down: the pan drops back to
        // the plain rate rather than staying fast until the arrow follows.
        await setView(page, { centre: { x: 150, y: 450 }, scale: 3 });
        const early = await traceKeys(page, async () => {
            await page.keyboard.down('Shift');
            await page.keyboard.down('ArrowRight');
            await page.waitForTimeout(300);
            marker = await pageNow(page);
            await page.keyboard.up('Shift');
            await page.waitForTimeout(300);
            await page.keyboard.up('ArrowRight');
        });

        const withShift = medianPanRate(samplesBefore(early, marker));
        const withoutShift = medianPanRate(samplesAfter(early, marker));
        expect(
            withoutShift,
            `releasing Shift mid-hold did not slow the pan down: ${withShift.toFixed(0)} → ${withoutShift.toFixed(0)} px/s`,
        ).toBeLessThan(withShift / 2);
        expect(withoutShift, 'releasing Shift stopped the pan').toBeGreaterThan(
            100,
        );
    });

    test('releasing a held arrow carries momentum ONWARD, not backwards', async ({
        page,
    }) => {
        test.slow();
        await openGridManifest(page);
        await setView(page, { centre: { x: 150, y: 450 }, scale: 3 });

        // The release hands `keyPan` to `momentum`, and the two are expressed
        // with opposite signs — `momentum` is the pointer's velocity, which
        // `stepMomentum` SUBTRACTS from the centre, where `keyPan` is the
        // centre's own. Get that negation wrong and every rate assertion above
        // still passes while the viewport visibly recoils the instant the key
        // comes up, so the direction is asserted here explicitly.
        await page.locator(SURFACE).focus();
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(300);
        await page.keyboard.up('ArrowRight');

        const atRelease = (await getView(page)).centre.x;
        await page.waitForTimeout(250);
        const coasted = (await getView(page)).centre.x;

        expect(
            coasted - atRelease,
            `the glide after release went the wrong way: ${atRelease.toFixed(1)} → ${coasted.toFixed(1)}`,
        ).toBeGreaterThan(5);
        // And it is a glide that ends, not a second velocity left running.
        await expect.poll(() => isMoving(page), { timeout: 5000 }).toBe(false);
    });

    test('a hold ends when the surface loses the keyboard', async ({
        page,
    }) => {
        test.slow();
        await openGridManifest(page);
        await setView(page, { centre: { x: 150, y: 450 }, scale: 3 });

        // Tab away mid-hold. The key-up will be delivered to whatever took
        // focus, so a surface that kept the velocity would pan forever — and
        // not merely visibly: the frame loop would never settle, so nothing
        // awaiting a settled paint would ever be answered.
        await page.locator(SURFACE).focus();
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(150);
        await page.locator('[aria-label="Toggle Information"]').first().focus();
        await page.waitForTimeout(100);

        expect(
            await isMoving(page),
            'the surface was still moving after losing focus',
        ).toBe(false);
        const parked = (await getView(page)).centre.x;
        await page.waitForTimeout(200);
        expect(
            (await getView(page)).centre.x,
            'the surface kept panning after losing focus',
        ).toBeCloseTo(parked, 6);

        // The stray key-up lands on the toolbar and leaves nothing behind.
        await page.keyboard.up('ArrowRight');
        expect(await isMoving(page)).toBe(false);

        // The same failure by another route: while Meta is held, macOS delivers
        // no `keyup` for other keys, so the arrow's release is simply never
        // reported. The modifier arriving has to end the hold.
        await page.locator(SURFACE).focus();
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(150);
        await page.keyboard.down('Meta');
        await page.keyboard.up('Meta');
        await page.waitForTimeout(100);

        expect(
            await isMoving(page),
            'the hold survived the Meta key that swallows its key-up',
        ).toBe(false);
        await page.keyboard.up('ArrowRight');
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

        // A HELD `+` is one press, not thirty a second. Unlike an arrow — whose
        // repeats recompute the same velocity — the zoom accumulates against
        // its target, so a step per repeat would compound the factor at the OS
        // repeat rate and slam the zoom ceiling in well under a second.
        // Synthesized here because Playwright never sends a repeat: this is the
        // event the OS sends, and the only way to press the key that hard.
        await setView(page, { centre: { x: 600, y: 450 }, scale: 1 });
        await page.locator(SURFACE).evaluate((element) => {
            for (let i = 0; i < 15; i += 1) {
                element.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: '+',
                        repeat: true,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            }
        });
        await settled(page);
        expect(
            (await getView(page)).scale,
            'a held + compounded its zoom factor per key repeat',
        ).toBeCloseTo(1, 6);

        // The same key, pressed rather than repeated, still zooms exactly once.
        await page.locator(SURFACE).evaluate((element) => {
            element.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: '+',
                    bubbles: true,
                    cancelable: true,
                }),
            );
        });
        await settled(page);
        expect((await getView(page)).scale).toBeCloseTo(zoomedIn, 6);

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
