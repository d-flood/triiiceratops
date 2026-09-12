import { test, expect, type Page } from '@playwright/test';

/*
 * `.tri-menu-item` — the shared row/icon-button of the toolbar, its flyouts and
 * the transport's track list — is floored at a 44px hit target under
 * `(pointer: coarse)`. The row is a grid, so that floor opens spare block space
 * the grid has to distribute, and packing it to the start leaves the glyph
 * riding high in its target: on a phone the unified bar's collapse toggle sat
 * visibly above the nav buttons beside it.
 *
 * The assertion is the relation — glyph centred in its button — which holds at
 * any target size or glyph size, rather than a captured offset. Touch projects
 * only: a fine pointer gets no floor, so there is no spare space to distribute
 * and nothing to centre.
 */

// The desktop projects run every spec, `@mobile` or not, so the guard is on the
// device capability the rule under test keys off rather than on the tag.
test.skip(
    ({ hasTouch }) => !hasTouch,
    'the 44px floor only applies under (pointer: coarse)',
);

const MANIFEST = '/demo-manifests/a11y/manifest.json';

/** WCAG 2.5.5 target, from `.tri-menu-item`'s coarse-pointer `min-height`. */
const TOUCH_TARGET = 44;

async function loadViewer(page: Page, config?: object): Promise<void> {
    const query = config
        ? `&config=${encodeURIComponent(JSON.stringify(config))}`
        : '';
    await page.goto(`/e2e/harness.html?manifest=${MANIFEST}${query}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });
    await page
        .locator('[data-testid="control-bar"]')
        .waitFor({ timeout: 60000 });
}

interface Glyph {
    label: string;
    /** Signed distance from the button's centre to its glyph's, in px. */
    offset: number;
    height: number;
}

/**
 * Every rendered `.tri-menu-item` in `root`, paired with how far its icon sits
 * off centre. Zero-height buttons are the ones inside a collapsed shell or a
 * closed popover; they have no geometry to assert.
 */
async function glyphOffsets(page: Page, root: string): Promise<Glyph[]> {
    return page.locator(root).evaluate((el) =>
        Array.from(el.querySelectorAll('.tri-menu-item'))
            .map((button) => {
                const svg = button.querySelector('svg');
                if (!svg) return null;
                const b = button.getBoundingClientRect();
                if (b.height === 0) return null;
                const g = svg.getBoundingClientRect();
                return {
                    label: button.getAttribute('aria-label') ?? '',
                    offset: g.top + g.height / 2 - (b.top + b.height / 2),
                    height: b.height,
                };
            })
            .filter((g): g is Glyph => g !== null),
    );
}

test('coarse-pointer menu items centre their glyph in the 44px target @mobile', async ({
    page,
}) => {
    await loadViewer(page, { controls: 'unified' });
    // The floor only exists under a coarse pointer; without it the buttons are
    // glyph-sized and the assertions below would pass vacuously.
    expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(true);

    // The unified bar holds the toolbar's action buttons and, at its end, the
    // collapse toggle that sits beside the nav buttons.
    const items = await glyphOffsets(page, '[data-testid="control-bar"]');
    expect(items.length).toBeGreaterThan(1);

    for (const { label, offset, height } of items) {
        expect(height, `"${label}" is floored to the touch target`).toBe(
            TOUCH_TARGET,
        );
        // Sub-pixel only: the grid must split the spare space, not pack it.
        expect(Math.abs(offset), `"${label}" glyph offset`).toBeLessThan(0.5);
    }
});
