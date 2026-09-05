/**
 * The front page, in a browser: what only a browser can see.
 *
 * Four things, each of which reads as correct in source and can still be wrong
 * on the page. That the first canvas is in the prerendered markup at a size the
 * browser can reserve before any script runs. That the viewer's weight is not
 * on the page's own critical path — no manifest and no viewer code until the
 * page has loaded, and nothing at all for a viewer below the fold until it is
 * scrolled to. That each install tab's control copies that manager's syntax
 * rather than the tab that was open first. And that the embedded viewer is set
 * in the page's own face and turns with the page's own scheme.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

import { PUBLISHED_ORIGIN } from './helpers/origin';
import { PACKAGE_MANAGERS } from '../src/lib/install';

function heroViewer(page: Page) {
    return page.getByRole('group', { name: 'The viewer, running' });
}

test.describe('the hero', () => {
    test('paints its first canvas from prerendered markup, correctly sized', async ({
        page,
    }) => {
        // The prerendered document, before a line of this application's script
        // has run: the sizes have to be there, or the box cannot be reserved
        // and the page shifts as the image arrives.
        await page.route('**/_app/**', (route) => route.abort());
        await page.goto('/');

        const first = heroViewer(page).locator('img');
        await expect(first).toHaveAttribute('width', /^\d+$/);
        await expect(first).toHaveAttribute('height', /^\d+$/);
        await expect(first).toHaveAttribute('loading', 'eager');
        await expect(first).toHaveAttribute('fetchpriority', 'high');
        await expect(first).not.toHaveAttribute('alt', '');

        // The reserved box agrees with the image it is reserving space for, so
        // the viewer arriving cannot change the page's height.
        const [reserved, intrinsic] = await Promise.all([
            first
                .locator('xpath=..')
                .evaluate((box) => getComputedStyle(box).aspectRatio),
            first.evaluate((image) => [
                image.getAttribute('width'),
                image.getAttribute('height'),
            ]),
        ]);
        expect(reserved.replace(/\s/g, '')).toBe(
            `${intrinsic[0]}/${intrinsic[1]}`,
        );
    });

    test('keeps the viewer out of the page’s own payload', async ({ page }) => {
        /*
         * The built tree rather than the development server, and the
         * document as served rather than the live DOM: this is a statement
         * about what a reader pays for before anything has run, and by the
         * time the page is interactive the viewer has injected its own
         * stylesheet into it.
         *
         * The viewer's markup and its stylesheet must not be in that payload.
         * The page arguing the viewer is light cannot put the viewer's weight
         * on its own critical path.
         */
        const prerendered = await (
            await page.request.get(`${PUBLISHED_ORIGIN}/`)
        ).text();
        expect(prerendered).not.toContain('viewer-root');
        expect(prerendered).not.toMatch(
            /rel="stylesheet"[^>]*(triiiceratops|svelte)\./,
        );

        // And it does arrive: an embed that never mounts would satisfy
        // everything above.
        await page.goto(`${PUBLISHED_ORIGIN}/`);
        await expect(heroViewer(page).locator('.viewer-root')).toBeAttached();
    });

    test('prerenders the viewer’s chrome as markup', async ({ page }) => {
        /*
         * The chrome is in the served document, drawn by the site's own
         * stylesheet — not server-rendered from the package, which is the
         * assertion above. A reader whose script has not run yet, or never
         * runs, sees the first canvas inside a viewer rather than inside a box.
         */
        const prerendered = await (
            await page.request.get(`${PUBLISHED_ORIGIN}/`)
        ).text();
        expect(prerendered).toContain('vwc__handle');
        expect(prerendered).toContain('vwc__bar');

        // And the live viewer replaces it, rather than the two stacking up.
        await page.goto(`${PUBLISHED_ORIGIN}/`);
        await expect(heroViewer(page).locator('.viewer-root')).toBeAttached();
        await expect(heroViewer(page).locator('.vwc')).toHaveCount(0);
    });

    test('mounts the viewer over its chrome without moving the page', async ({
        page,
    }) => {
        /*
         * The whole reason for the reserved box and the prerendered chrome: the
         * page is laid out before any viewer code runs, so mounting the viewer
         * over that is a change of contents rather than of layout.
         *
         * Two assertions, because they fail for different reasons. Nothing
         * outside the reserved box may move at all — that is the property the
         * box exists for, and a source outside it means the box was wrong. And
         * cumulative layout shift, as the metric is defined and reported, has
         * to be 0. What that tolerates is the one shift there is: the viewer
         * re-centring its own control cluster inside the box once the manifest
         * tells it how many canvases there are, worth 0.0005. It is the
         * viewer's internal business, no host can prevent it, and it is three
         * orders of magnitude below the threshold Lighthouse reports on.
         */
        await page.addInitScript(() => {
            type Shift = PerformanceEntry & {
                value: number;
                hadRecentInput: boolean;
                sources?: { node?: Node | null }[];
            };
            const seen: { value: number; outside: boolean }[] = [];
            (window as unknown as { seen: typeof seen }).seen = seen;
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    const shift = entry as Shift;
                    if (shift.hadRecentInput) continue;
                    const sources = shift.sources ?? [];
                    seen.push({
                        value: shift.value,
                        outside: sources.some(({ node }) => {
                            const element =
                                node instanceof Element
                                    ? node
                                    : (node?.parentElement ?? null);
                            return (
                                element !== null &&
                                element.closest('.vw') === null
                            );
                        }),
                    });
                }
            }).observe({ type: 'layout-shift', buffered: true });
        });

        await page.goto(`${PUBLISHED_ORIGIN}/`);
        await expect(heroViewer(page).locator('.viewer-root')).toBeAttached();
        // The renderer paints a frame or two after it mounts, and a shift it
        // caused would be recorded then rather than on mount.
        await page.waitForTimeout(2000);

        const shifts = await page.evaluate(
            () =>
                (
                    window as unknown as {
                        seen: { value: number; outside: boolean }[];
                    }
                ).seen,
        );
        expect(
            shifts.filter((shift) => shift.outside),
            'something outside the reserved box moved',
        ).toEqual([]);

        const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
        // Rounded the way the metric is reported, which is what "CLS is 0"
        // means. A real shift cannot hide here: 0.0005 is the largest total
        // this passes, and the smallest shift Lighthouse counts against a page
        // is two hundred times that.
        expect(Math.round(total * 1000) / 1000).toBe(0);
    });

    test('is the page’s only viewer, and it is above the fold', async ({
        page,
    }) => {
        await page.goto('/');
        const viewers = page.locator('.vw');
        await expect(viewers).toHaveCount(1);

        const [top, fold] = await Promise.all([
            viewers.first().evaluate((box) => box.getBoundingClientRect().top),
            page.evaluate(() => window.innerHeight),
        ]);
        // The front page carries one viewer by design, and it is the hero's.
        // A viewer below this fold would have to be lazy; there is none here,
        // which is why nothing on this route exercises that path.
        expect(top).toBeLessThan(fold);
    });

    test('cycles arrangements only once the page is interactive', async ({
        page,
    }) => {
        await page.goto('/');
        const controls = page
            .getByRole('group', { name: 'Chrome arrangement' })
            .getByRole('button');
        await expect(controls.first()).toHaveAttribute('aria-pressed', 'true');

        // Choosing an arrangement stops the cycle and holds that one.
        const chosen = controls.nth(2);
        await expect(async () => {
            await chosen.click();
            await expect(chosen).toHaveAttribute('aria-pressed', 'true');
        }).toPass();
        await page.waitForTimeout(1200);
        await expect(chosen).toHaveAttribute('aria-pressed', 'true');
    });
});

test.describe('the install block', () => {
    /**
     * What the control put on the clipboard, recorded in the page.
     *
     * The write is intercepted rather than the system clipboard read back: the
     * clipboard is one shared resource on the machine, so two of these tests
     * running at once read each other's text. What is asserted is unchanged —
     * the exact string the reader ends up with.
     */
    async function watchClipboard(page: Page) {
        await page.addInitScript(() => {
            const written: string[] = [];
            (window as unknown as { written: string[] }).written = written;
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: {
                    writeText: (text: string) => {
                        written.push(text);
                        return Promise.resolve();
                    },
                },
            });
        });
    }

    async function copied(page: Page, control: Locator): Promise<string> {
        // Every route is prerendered, so the control is clickable before the
        // page hydrates and a single click can land on markup that has no
        // handler yet. The control saying it copied is the signal that the
        // click took, and a click that did take satisfies this on the first
        // pass, so it cannot copy twice.
        await expect(async () => {
            await control.click();
            await expect(control).toHaveText('Copied', { timeout: 1000 });
        }).toPass();
        return page.evaluate(
            () => (window as unknown as { written: string[] }).written.at(-1)!,
        );
    }

    test.beforeEach(async ({ page }) => {
        await watchClipboard(page);
    });

    for (const manager of PACKAGE_MANAGERS) {
        test(`${manager.id}'s tab copies ${manager.id}'s own syntax`, async ({
            page,
        }) => {
            await page.goto('/');
            const tab = page.getByRole('tab', {
                name: manager.id,
                exact: true,
            });
            await expect(async () => {
                await tab.click();
                await expect(tab).toHaveAttribute('aria-selected', 'true');
            }).toPass();

            await expect(
                page
                    .getByRole('tabpanel', { name: manager.id })
                    .locator('code'),
            ).toHaveText(manager.command);
            expect(
                await copied(
                    page,
                    page.getByRole('button', {
                        name: `Copy the ${manager.id} install command`,
                    }),
                ),
            ).toBe(manager.command);
        });
    }

    test('the CDN pair copies the script tag and the element together', async ({
        page,
    }) => {
        await page.goto('/');
        const text = await copied(
            page,
            page.getByRole('button', {
                name: 'Copy the CDN script and element',
            }),
        );
        expect(text).toContain('<script src="https://unpkg.com/triiiceratops');
        expect(text).toContain('<triiiceratops-viewer');
    });
});

test.describe('the embedded viewer', () => {
    /**
     * The viewer's root, once it has mounted.
     *
     * Waited for with a budget sized to what it is actually waiting on: the
     * element bundle has to be fetched, registered and the custom element
     * upgraded before this node exists at all. That is a script load rather
     * than a render, and on a cold development server under a parallel run it
     * outlasts the default assertion timeout — which reads as "the viewer never
     * mounted" when it only mounted late.
     */
    async function viewerRoot(page: Page): Promise<Locator> {
        const root = heroViewer(page).locator('.viewer-root');
        await expect(root).toBeAttached({ timeout: 30_000 });
        return root;
    }

    test('is set in the page’s own face', async ({ page }) => {
        await page.goto('/');
        const root = await viewerRoot(page);

        const [inViewer, onPage] = await Promise.all([
            root.evaluate((node) => getComputedStyle(node).fontFamily),
            page.evaluate(() => getComputedStyle(document.body).fontFamily),
        ]);
        expect(inViewer).toBe(onPage);
    });

    test('turns with the rail’s toggle rather than islanding', async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: 'light' });
        await page.goto('/');
        const root = await viewerRoot(page);

        /**
         * The viewer's ground, once it has settled.
         *
         * Polled and read twice a frame apart: a colour sampled while a
         * transition or the first style recalculation is in flight is a value
         * no scheme ever declared.
         */
        const settled = async () => {
            let seen = '';
            await expect(async () => {
                const first = await root.evaluate((node) =>
                    getComputedStyle(node).getPropertyValue('--tri-viewer-bg'),
                );
                const again = await root.evaluate(
                    (node) =>
                        new Promise<string>((resolve) =>
                            requestAnimationFrame(() =>
                                resolve(
                                    getComputedStyle(node).getPropertyValue(
                                        '--tri-viewer-bg',
                                    ),
                                ),
                            ),
                        ),
                );
                expect(again).toBe(first);
                expect(first.trim()).not.toBe('');
                seen = first.trim();
            }).toPass();
            return seen;
        };

        const light = await settled();
        await expect(async () => {
            await page
                .getByRole('navigation', { name: 'Site navigation' })
                .getByRole('button', { name: 'Switch to dark theme' })
                .click();
            expect(await settled()).not.toBe(light);
        }).toPass();
    });
});

/**
 * The deployments block, which the front page and `/production/` both render
 * from one declaration.
 *
 * The failure this guards is drift: a deployment added to a page rather than to
 * the declaration would show on one page and not the other. Only a browser sees
 * both pages' rendered output, so only a browser can compare them.
 */
async function deploymentLinks(page: Page, path: string): Promise<string[]> {
    await page.goto(path);
    return page
        .locator('.prod__row .who')
        .evaluateAll((links) =>
            links.map((link) => (link as HTMLAnchorElement).href),
        );
}

test.describe('the deployments', () => {
    test('put the front page’s entries inside /production/’s', async ({
        page,
    }) => {
        const front = await deploymentLinks(page, '/');
        const production = await deploymentLinks(page, '/production/');

        expect(front.length).toBeGreaterThan(0);
        expect(production).toEqual(expect.arrayContaining(front));
    });

    test('offer a reading room’s landing page and its evidence separately', async ({
        page,
    }) => {
        await page.goto('/production/');
        const rooms = page
            .getByRole('heading', { name: 'Reading rooms running the viewer' })
            .locator('xpath=ancestor::section[1]')
            .locator('.prod__row');

        expect(await rooms.count()).toBeGreaterThan(0);
        for (const row of await rooms.all()) {
            const landing = row.locator('.who');
            const example = row.locator('.go');
            await expect(landing).toHaveAttribute('href', /^https:\/\//);
            await expect(example).toHaveAttribute('href', /^https:\/\//);
            expect(await landing.getAttribute('href')).not.toBe(
                await example.getAttribute('href'),
            );
        }
    });

    test('keep mkiiif out of the reading rooms', async ({ page }) => {
        // A tool that emits pages carrying the viewer is not a collection
        // anybody browses, and the page must not imply that it is.
        await page.goto('/production/');
        const tools = page
            .getByRole('heading', { name: 'Tools that ship the viewer' })
            .locator('xpath=ancestor::section[1]')
            .locator('.prod__row');

        await expect(tools.filter({ hasText: 'mkiiif' })).toHaveCount(1);
        await expect(
            page
                .getByRole('heading', {
                    name: 'Reading rooms running the viewer',
                })
                .locator('xpath=ancestor::section[1]')
                .locator('.prod__row')
                .filter({ hasText: 'mkiiif' }),
        ).toHaveCount(0);
    });
});
