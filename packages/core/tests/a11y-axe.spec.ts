import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/*
 * Automated WCAG 2.2 AA scan suite.
 *
 * Scans each meaningful viewer UI state against each of the four built-in
 * themes with @axe-core/playwright and requires ZERO violations. The scan is
 * scoped to the <triiiceratops-viewer> element (axe descends into its shadow
 * root automatically) so it audits the viewer chrome and nothing around it. Any
 * rule exception would require a documented allowlist entry with a written
 * rationale — there are none here.
 *
 * Each test loads the page once and re-scans across all four themes in place
 * (the `theme` attribute is reactive), so the state × theme matrix costs one
 * page load per state rather than one per cell.
 */

// Axe + the renderer is heavy: parallel cold page loads saturate the dev server. Run
// this file's scans in a single worker (CI already runs workers=1). Keeps the
// state × theme matrix reliable without touching playwright.config.ts.
test.describe.configure({ mode: 'serial' });

/*
 * Scanned with the reader's reduced-motion preference on, which removes ONE of
 * the two ways a theme swap can put a half-applied palette in front of axe: the
 * chrome's colour transitions. Under this preference the viewer has none at all
 * — its own documented behaviour, pinned by `a11y-reduced-motion.spec.ts`. The
 * other way, and the one that actually bit, is the engine applying the swap to
 * the shadow tree late; {@link themeSettled} is what handles that, and it is
 * what the matrix leans on.
 *
 * Colours themselves are unaffected by the preference, so this is the same scan
 * either way.
 */
test.use({ reducedMotion: 'reduce' });

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

/**
 * Opens on `dracula`, and that is not cosmetic: it guarantees that the first
 * theme {@link scanAllThemes} switches to is a real change, which is what lets
 * that function wait for the change instead of guessing at a duration.
 */
async function loadViewer(page: Page, query = ''): Promise<void> {
    // Cold vite compilation across parallel workers can be slow on first load;
    // give navigation + the chrome wait a generous budget (see test.slow()).
    await page.goto(
        `/e2e/harness.html?manifest=${MANIFEST}&theme=dracula${query}`,
        {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        },
    );
    // Wait for the chrome (toolbar) rather than tile rendering: the a11y
    // scan audits the DOM/chrome, and tile rendering is heavy enough that waiting
    // on it flakes under parallel workers.
    await page
        .locator('[aria-controls="tri-flyout-viewing-mode"]')
        .first()
        .waitFor({ timeout: 60000 });
    await page.waitForTimeout(400);
}

/**
 * Every colour the viewer's chrome is currently painting, as one string.
 *
 * There is no event for "the theme finished applying", so comparing this with
 * itself a moment later is the signal {@link themeSettled} is built out of.
 */
async function chromeColours(page: Page): Promise<string> {
    return page.evaluate(() => {
        const root = document.querySelector('triiiceratops-viewer')?.shadowRoot;
        if (!root) return '';
        return [...root.querySelectorAll('*')]
            .map((element) => {
                const style = getComputedStyle(element);
                return `${style.color}|${style.backgroundColor}|${style.borderColor}`;
            })
            .join(';');
    });
}

/**
 * Wait until the theme swap has actually landed.
 *
 * Axe reads COMPUTED colour, so it has to run on the new theme's colours and
 * not on a mixture. Two things put a mixture in front of it: the chrome
 * transitions colour, and — the one that bites hardest — WebKit applies a theme
 * swap inside the shadow tree a couple of hundred milliseconds after the
 * attribute lands. Scanned before that, axe pairs the OLD foreground with the
 * NEW background and reports a contrast violation for a pairing no theme ever
 * paints, against a frame no reader ever sees.
 *
 * Waiting for stillness alone does not survive either: the colours are perfectly
 * still BEFORE the swap starts, so a poll watching only for stillness settles on
 * the old theme and reports success. Two conditions together are what make this
 * deterministic, and neither is sufficient alone:
 *
 *   - the palette must have CHANGED from `before`, the one the page was painting
 *     when the attribute was set. Every switch this suite makes is a real change
 *     (see {@link loadViewer}), so this is always reachable.
 *   - it must then hold still for {@link STABLE_READS} consecutive reads. One
 *     repeat is not enough: the swap reaches the chrome in pieces, so the first
 *     element to take the new palette satisfies "changed" while the rest are
 *     still on the old one, and two reads can straddle that. Measured on this
 *     suite, a scan 100ms after the attribute lands still catches the old
 *     foreground while ones from 300ms on are clean.
 */
const STABLE_READS = 3;

async function themeSettled(page: Page, before: string): Promise<void> {
    let previous: string | null = null;
    let held = 0;
    await expect
        .poll(
            async () => {
                const current = await chromeColours(page);
                held = current === previous ? held + 1 : 0;
                previous = current;
                return current !== before && held >= STABLE_READS;
            },
            { intervals: [50, 100, 100, 100, 100, 200], timeout: 15_000 },
        )
        .toBe(true);
}

async function scanAllThemes(page: Page, state: string): Promise<void> {
    for (const theme of THEMES) {
        const before = await chromeColours(page);
        await page.evaluate((t) => {
            document
                .querySelector('triiiceratops-viewer')
                ?.setAttribute('theme', t);
        }, theme);
        await themeSettled(page, before);

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

test('axe: gallery flyout open × all themes', async ({ page }) => {
    test.slow();
    await loadViewer(page);
    const toggle = page.locator('[aria-controls="tri-flyout-gallery"]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await scanAllThemes(page, 'gallery-open');
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
