import { test, expect, type Page } from '@playwright/test';

/**
 * The canvas info popover wraps its text rather than scrolling sideways.
 *
 * Its scroll box is `overflow-y: auto`, which CSS computes to
 * `overflow-x: auto` on the other axis — so any content wider than the
 * popover's fixed width produces a horizontal scrollbar. Publisher text is
 * exactly where that happens: a long shelfmark, a German compound noun, a
 * `rendering` URL used as its own label.
 *
 * The fixture is `public/e2e/canvas-info-overflow.html`, whose canvas label,
 * summary, metadata label, metadata value and `rendering` label are each a
 * single unbreakable word wider than the popover.
 */
const TRIGGER = 'button[aria-label="Canvas Information"]';
const POPOVER = '[role="dialog"][aria-label="Canvas Info"]';

/** The popover's box against the viewer's, rounded to whole pixels. */
function measure(page: Page) {
    return page.evaluate((popoverSelector) => {
        const host = document.querySelector('triiiceratops-viewer')!;
        const root = host.shadowRoot!.querySelector('.viewer-root')!;
        const popover = host.shadowRoot!.querySelector(popoverSelector)!;
        const bounds = root.getBoundingClientRect();
        const rect = popover.getBoundingClientRect();

        return {
            overhangStart: Math.max(0, Math.round(bounds.left - rect.left)),
            overhangEnd: Math.max(0, Math.round(rect.right - bounds.right)),
            width: rect.width,
            viewer: bounds.width,
        };
    }, POPOVER);
}

test('the canvas info popover wraps long words instead of scrolling sideways', async ({
    page,
}) => {
    await page.goto('/e2e/canvas-info-overflow.html', {
        waitUntil: 'domcontentloaded',
    });

    await page.locator(TRIGGER).click({ timeout: 20_000 });
    await expect(page.locator(POPOVER)).toBeVisible();

    // Every box inside the popover, the scroll box included, fits the width it
    // was given. Inline boxes are skipped: they have no client box to compare
    // against (`clientWidth` is 0), so they can neither scroll nor be measured
    // this way. `scrollWidth` rounds up, so allow the sub-pixel slack a
    // fractional layout leaves behind.
    const overflowing = await page.evaluate((popoverSelector) => {
        const popover = document
            .querySelector('triiiceratops-viewer')!
            .shadowRoot!.querySelector(popoverSelector)!;

        return [popover, ...popover.querySelectorAll('*')]
            .filter((el) => el.clientWidth > 0)
            .filter((el) => el.scrollWidth - el.clientWidth > 1)
            .map((el) => ({
                selector: `${el.tagName.toLowerCase()}.${el.className}`,
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
            }));
    }, POPOVER);

    expect(overflowing).toEqual([]);
});

/**
 * The popover is centred on its trigger, which on a narrow viewer sits close
 * enough to the edge that centring would hang the box outside the viewer
 * entirely. It has to slide back inside instead, and shrink if even that is not
 * enough — the viewer's own box is the limit, not the trigger's.
 */
test('the canvas info popover stays inside a narrow viewer', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto('/e2e/canvas-info-overflow.html', {
        waitUntil: 'domcontentloaded',
    });
    await page.evaluate(() => {
        const viewer = document.getElementById('v')!;
        viewer.style.width = '360px';
        viewer.style.height = '600px';
    });

    await page.locator(TRIGGER).click({ timeout: 20_000 });
    await expect(page.locator(POPOVER)).toBeVisible();

    const box = await measure(page);

    expect(box.overhangStart).toBeLessThanOrEqual(0);
    expect(box.overhangEnd).toBeLessThanOrEqual(0);
    // Still the width it asks for; a 360px viewer has room for 18rem.
    expect(box.width).toBeGreaterThan(280);

    // Narrower than the popover wants to be, while it is already open: it
    // shrinks to the viewer rather than hanging outside it, and the placement
    // follows the resize instead of waiting for the next open.
    await page.evaluate(() => {
        document.getElementById('v')!.style.width = '240px';
    });

    await expect
        .poll(() => measure(page))
        .toMatchObject({ overhangStart: 0, overhangEnd: 0 });

    const narrowed = await measure(page);
    expect(narrowed.width).toBeLessThanOrEqual(narrowed.viewer);
});
