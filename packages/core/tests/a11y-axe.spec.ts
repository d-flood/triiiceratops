import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/*
 * Automated WCAG 2.2 AA scan suite.
 *
 * Scans each meaningful viewer UI state against each of the four built-in
 * themes with @axe-core/playwright and requires ZERO violations. The scan is
 * scoped to the <triiiceratops-viewer> element (axe descends into its shadow
 * root automatically) so it audits the viewer chrome, not the surrounding demo
 * page. Any rule exception would require a documented allowlist entry with a
 * written rationale — there are none here.
 *
 * Each test loads the page once and re-scans across all four themes in place
 * (the `theme` attribute is reactive), so the state × theme matrix costs one
 * page load per state rather than one per cell.
 */

// Axe + the renderer is heavy: parallel cold page loads saturate the dev server. Run
// this file's scans in a single worker (CI already runs workers=1). Keeps the
// state × theme matrix reliable without touching playwright.config.ts.
test.describe.configure({ mode: 'serial' });

// The a11y suite audits the desktop viewer. Skip on mobile projects so this
// file stays deterministic there.
test.beforeEach(({ isMobile }) => {
    test.skip(!!isMobile, 'a11y suite targets the desktop viewer (chromium)');
});

const THEMES = ['light', 'dark', 'teal', 'dracula'] as const;

const MANIFEST = '/demo-manifests/a11y/manifest.json';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Config that opens every built-in panel so their chrome is in the scan. */
const ALL_PANELS = encodeURIComponent(
    JSON.stringify({
        information: { open: true },
        structures: { open: true },
        search: { open: true },
        annotations: { open: true },
        gallery: { open: true, dockPosition: 'right' },
    }),
);

async function loadViewer(page: Page, query = ''): Promise<void> {
    // Cold vite compilation across parallel workers can be slow on first load;
    // give navigation + the chrome wait a generous budget (see test.slow()).
    await page.goto(`/?manifest=${MANIFEST}${query}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });
    // Wait for the chrome (toolbar) rather than tile rendering: the a11y
    // scan audits the DOM/chrome, and tile rendering is heavy enough that waiting
    // on it flakes under parallel workers.
    await page
        .locator('[aria-controls="tri-flyout-viewing-mode"]')
        .first()
        .waitFor({ timeout: 60000 });
    await page.waitForTimeout(400);
}

async function scanAllThemes(page: Page, state: string): Promise<void> {
    for (const theme of THEMES) {
        await page.evaluate((t) => {
            document
                .querySelector('triiiceratops-viewer')
                ?.setAttribute('theme', t);
        }, theme);
        await page.waitForTimeout(200);

        const results = await new AxeBuilder({ page })
            .include('triiiceratops-viewer')
            .withTags(WCAG_TAGS)
            .analyze();
        const summary = results.violations
            .map(
                (v) =>
                    `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
                        .map((n) => n.target.join(' '))
                        .join('\n    ')}`,
            )
            .join('\n');
        expect(
            results.violations,
            `${state} / theme=${theme} axe violations:\n${summary}`,
        ).toEqual([]);
    }
}

test('axe: default state × all themes', async ({ page }) => {
    test.slow();
    await loadViewer(page);
    await scanAllThemes(page, 'default');
});

test('axe: all panels open × all themes', async ({ page }) => {
    test.slow();
    await loadViewer(page, `&config=${ALL_PANELS}`);
    await scanAllThemes(page, 'panels-open');
});

test('axe: viewing-mode flyout open × all themes', async ({ page }) => {
    test.slow();
    await loadViewer(page);
    const toggle = page.locator('[aria-controls="tri-flyout-viewing-mode"]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await scanAllThemes(page, 'flyout-open');
});

/*
 * The renderer's image surface is a focusable, labelled tab stop. The scans
 * above wait for the chrome, so they can race the surface's own mount; this
 * one waits for the image surface itself and re-runs the whole matrix with
 * that tab stop guaranteed present — a focusable element with a role and no
 * accessible name, or an unreachable one, is exactly what axe catches.
 */
test('axe: Canvas2D renderer (focusable image surface) × all themes', async ({
    page,
}) => {
    test.slow();
    await loadViewer(page);
    await page
        .locator('[data-testid="canvas-renderer-root"]')
        .waitFor({ timeout: 60000 });
    await scanAllThemes(page, 'canvas-renderer');
});
