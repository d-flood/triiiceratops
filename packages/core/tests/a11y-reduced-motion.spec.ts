import { test, expect } from '@playwright/test';

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
        const selectors = ['.viewer-root', 'button', '[data-flyout-panel]'];
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
