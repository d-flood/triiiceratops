/**
 * Both schemes, in a browser: what only a browser can see.
 *
 * The three states — an explicit light choice, an explicit dark choice, and no
 * stored choice following the machine — and the one that cannot be tested any
 * other way: the theme being right on the *first* paint rather than after the
 * page settles.
 *
 * Ratios are not asserted here. They are arithmetic on the palette, checked in
 * `tests/unit/palette.test.ts`; a browser adds nothing but flakiness to them.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../src/lib/theme';

/** The two grounds, from the palette, as the browser will report them. */
const BONE = { light: 'rgb(247, 242, 233)', dark: 'rgb(26, 22, 19)' };

/**
 * The body's background once it has settled.
 *
 * Polled rather than read once: a colour read while a transition or the first
 * style recalculation is still in flight is a value no scheme ever declared.
 */
async function settledGround(page: Page): Promise<string> {
    let ground = '';
    await expect(async () => {
        const seen = await page.evaluate(
            () => getComputedStyle(document.body).backgroundColor,
        );
        expect([BONE.light, BONE.dark]).toContain(seen);
        // Two identical reads a frame apart: settled, not merely plausible.
        const again = await page.evaluate(
            () =>
                new Promise<string>((resolve) =>
                    requestAnimationFrame(() =>
                        resolve(
                            getComputedStyle(document.body).backgroundColor,
                        ),
                    ),
                ),
        );
        expect(again).toBe(seen);
        ground = seen;
    }).toPass();
    return ground;
}

function toggle(page: Page) {
    return page
        .getByRole('navigation', { name: 'Site navigation' })
        .getByRole('button', { name: /Switch to (light|dark) theme/ });
}

/**
 * Click a control until the scheme has actually changed.
 *
 * Every route is prerendered, so the control is present and clickable before the
 * page hydrates and a single click can land on markup that has no handler yet.
 * Retrying is the assertion that the control works, without reaching for a
 * hydration signal that is SvelteKit's internal business. A click that did take
 * satisfies the check on the first pass, so this cannot toggle twice.
 */
async function switchTo(page: Page, control: Locator, scheme: 'light' | 'dark') {
    await expect(async () => {
        await control.click();
        expect(await settledGround(page)).toBe(BONE[scheme]);
    }).toPass();
}

test.describe('with no stored choice', () => {
    test('a dark machine preference opens dark', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.goto('/');
        expect(await settledGround(page)).toBe(BONE.dark);
        await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    });

    test('a light machine preference opens light', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'light' });
        await page.goto('/');
        expect(await settledGround(page)).toBe(BONE.light);
        await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    });

    test('the toggle offers the scheme the reader is not in', async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.goto('/');
        await expect(
            toggle(page).and(
                page.getByRole('button', { name: 'Switch to light theme' }),
            ),
        ).toHaveCount(1);
    });
});

test.describe('an explicit choice', () => {
    test('applies at once, and survives a reload', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.goto('/');
        expect(await settledGround(page)).toBe(BONE.dark);

        await switchTo(page, toggle(page), 'light');
        expect(
            await page.evaluate(
                (key) => localStorage.getItem(key),
                THEME_STORAGE_KEY,
            ),
        ).toBe('light');

        await page.reload();
        expect(await settledGround(page)).toBe(BONE.light);
    });

    test('travels across routes, including a full navigation', async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: 'light' });
        await page.goto('/');
        await switchTo(page, toggle(page), 'dark');

        // A followed link, then a fresh document load of the same route. The
        // appendix is out of the rail by design, so the footer is where it is
        // linked from.
        await page
            .getByRole('contentinfo')
            .getByRole('link', { name: 'Design system' })
            .click();
        await expect(page).toHaveURL(/\/system\/$/);
        expect(await settledGround(page)).toBe(BONE.dark);

        await page.goto('/system/');
        expect(await settledGround(page)).toBe(BONE.dark);
    });
});

test.describe('a hard load with a choice opposing the machine', () => {
    /**
     * The no-flash assertion, and the reason the applying script is inline and
     * blocking.
     *
     * The applied scheme is sampled twice from the new document, both times by
     * a probe installed before any of the document's own script runs: at the
     * instant the parser opens the body, and in the frame before the first
     * paint. The body sample is the sharp one — it lands inside the parsing
     * task, so a script that reached for a task or a frame instead of running
     * inline has demonstrably not applied the choice yet. Deferring the applying
     * script by a single `setTimeout` fails this test.
     */
    for (const [preference, choice] of [
        ['dark', 'light'],
        ['light', 'dark'],
    ] as const) {
        test(`prefers ${preference}, chose ${choice}: no flash of ${preference}`, async ({
            page,
        }) => {
            await page.emulateMedia({ colorScheme: preference });
            await page.goto('/');
            await page.evaluate(
                ([key, value]) => localStorage.setItem(key, value),
                [THEME_STORAGE_KEY, choice] as const,
            );

            const samples: { at: string; theme: string | null }[] = [];
            await page.exposeFunction(
                'recordScheme',
                (at: string, theme: string | null) => {
                    samples.push({ at, theme });
                },
            );
            // Runs on the new document before any of its own script does.
            await page.addInitScript(() => {
                const record = (
                    window as unknown as {
                        recordScheme: (at: string, theme: string | null) => void;
                    }
                ).recordScheme;
                const sample = (at: string) =>
                    record(
                        at,
                        document.documentElement.getAttribute('data-theme'),
                    );
                // The instant the parser closes the head and opens the body: no
                // paint has happened, and any script that reached for a task or
                // a frame instead of running inline has not yet run.
                // `document` is the observation target because this runs before
                // the parser has created `documentElement`.
                new MutationObserver((_, observer) => {
                    if (document.body === null) return;
                    sample('body');
                    observer.disconnect();
                }).observe(document, { childList: true, subtree: true });
                // The frame before the first paint.
                requestAnimationFrame(() => sample('frame'));
            });

            await page.reload();
            expect(await settledGround(page)).toBe(BONE[choice]);

            expect(samples.map((sample) => sample.at).sort()).toEqual([
                'body',
                'frame',
            ]);
            for (const sample of samples) {
                expect(sample.theme, `at the ${sample.at} sample`).toBe(choice);
            }
        });
    }
});

test.describe('with localStorage unavailable', () => {
    test.beforeEach(async ({ page }) => {
        // A private window, or a browser set to block site data: every accessor
        // throws. The page must still render, and the control must not break.
        await page.addInitScript(() => {
            Object.defineProperty(window, 'localStorage', {
                configurable: true,
                get() {
                    throw new DOMException('site data blocked');
                },
            });
        });
    });

    test('the page renders in the machine’s preferred scheme', async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto('/');
        expect(await settledGround(page)).toBe(BONE.dark);
        expect(errors).toEqual([]);
    });

    test('the toggle still switches the scheme for this document', async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: 'light' });
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto('/');
        await switchTo(page, toggle(page), 'dark');
        expect(errors).toEqual([]);
    });
});

test.describe('at phone size', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the sheet carries the same control, so the choice is reachable', async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: 'light' });
        await page.goto('/size/');

        const sheet = page.getByRole('dialog', { name: 'Site navigation' });
        await expect(async () => {
            await page.getByRole('button', { name: 'Open navigation' }).click();
            await expect(sheet).toBeVisible({ timeout: 1000 });
        }).toPass();

        await switchTo(
            page,
            sheet.getByRole('button', { name: 'Switch to dark theme' }),
            'dark',
        );
    });
});
