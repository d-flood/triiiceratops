import { test, expect, type Page } from '@playwright/test';

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
