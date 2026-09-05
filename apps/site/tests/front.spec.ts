/**
 * The front page, in a browser: what only a browser can see.
 *
 * Each of these reads as correct in source and can still be wrong on the page.
 * That the first canvas is in the prerendered markup at a size the browser can
 * reserve before any script runs. That the viewer's weight is not on the page's
 * own critical path — no manifest and no viewer code until the page has loaded,
 * and nothing at all for a viewer below the fold until it is scrolled to. That
 * the panel opens on the arrangement the prerendered chrome was drawn for, and
 * moves one setting at a time until a reader takes it over. And that the
 * embedded viewer is set in the page's own face and turns with the page's own
 * scheme.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

import { PUBLISHED_ORIGIN } from './helpers/origin';
import { HERO_EXAMPLE } from '../src/lib/examples';

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

        // The box declares a shape, so the viewer arriving cannot change the
        // page's height at the widths where that shape is what sizes it. On the
        // hero the band's own height wins above its breakpoint; the declared
        // shape is still on the box, and is what sizes it below.
        const shape = HERO_EXAMPLE.reserve ?? HERO_EXAMPLE.firstCanvas;
        const reserved = await first
            .locator('xpath=..')
            .evaluate((box) => getComputedStyle(box).aspectRatio);
        expect(reserved.replace(/\s/g, '')).toBe(
            `${shape.width}/${shape.height}`,
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
         * cumulative layout shift has to stay at nothing a reader or a report
         * can see. What that tolerates is the one shift there is: the viewer
         * re-centring its own control cluster inside the box once the manifest
         * tells it how many canvases there are, and how wide its pager is
         * therefore going to be. It is the viewer's internal business, no host
         * can prevent it, and it is two orders of magnitude below the threshold
         * Lighthouse reports on.
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
        // A real shift cannot hide under this: the control cluster's own
        // re-centring is worth 0.0005, "good" starts at 0.1, and anything a
        // reader could notice moving in a box this size is worth more than
        // 0.002.
        expect(total).toBeLessThan(0.002);
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

    /** What every knob in the panel is currently set to, as one string. */
    async function panelState(page: Page) {
        return (
            await page
                .locator('.hp__seg')
                .evaluateAll((segs) =>
                    segs.map(
                        (seg) =>
                            seg.querySelector<HTMLInputElement>('input:checked')
                                ?.value ?? '',
                    ),
                )
        ).join('|');
    }

    test('moves on its own, and holds when a reader takes over', async ({
        page,
    }) => {
        await page.goto('/');

        const before = await panelState(page);
        await expect(async () => {
            expect(await panelState(page)).not.toBe(before);
        }).toPass({ timeout: 12_000 });

        /*
         * Moving a control holds the cycle, and the one moved has to still be
         * the one set a cycle later. The retry is for the prerendered page:
         * every route is served as markup, so a single click can land before
         * hydration has attached a handler.
         */
        const chosen = page
            .getByRole('radiogroup', { name: 'nav.edge', exact: true })
            .getByRole('radio', { name: 'top' });
        await expect(async () => {
            await chosen.click();
            await expect(chosen).toBeChecked();
        }).toPass();

        const settled = await panelState(page);
        await page.waitForTimeout(4000);
        await expect(chosen).toBeChecked();
        expect(await panelState(page)).toBe(settled);
    });

    /**
     * Which example the timeline says is showing.
     *
     * The knob rows cannot answer this: the sequence moves settings the panel
     * offers no knob for — the toolbar opening, the information pane docking —
     * so two steps can leave every chip where it was. The dots are what the
     * page shows a reader for those steps, and they are what a test of the
     * transport has to read.
     */
    async function exampleAt(page: Page) {
        return page
            .locator('.hp__line')
            .evaluate((line) =>
                [...line.querySelectorAll('.hp__dot')].findIndex((dot) =>
                    dot.classList.contains('hp__dot--now'),
                ),
            );
    }

    test('gives a reader the transport over the cycle', async ({ page }) => {
        await page.goto('/');

        // One dot per example, grouped into the four runs the route is made of.
        await expect(page.locator('.hp__dot')).toHaveCount(21);
        await expect(page.locator('.hp__grp')).toHaveCount(4);

        const back = page.getByRole('button', { name: 'Back one setting' });
        await page.getByRole('button', { name: 'Hold the cycle' }).click();
        const held = await exampleAt(page);
        await page.waitForTimeout(4000);
        expect(await exampleAt(page)).toBe(held);

        const forward = page.getByRole('button', {
            name: 'Forward one setting',
        });
        await forward.click();
        const stepped = await exampleAt(page);
        expect(stepped).not.toBe(held);

        // Back and forward walk one written route, so the step a reader backs
        // out of is the step forward gives them again.
        await back.click();
        expect(await exampleAt(page)).toBe(held);
        await forward.click();
        expect(await exampleAt(page)).toBe(stepped);

        await page.getByRole('button', { name: 'Run the cycle' }).click();
        await expect(async () => {
            expect(await exampleAt(page)).not.toBe(stepped);
        }).toPass({ timeout: 12_000 });
    });

    test('starts on the arrangement its prerendered chrome is drawn for', async ({
        page,
    }) => {
        /*
         * Before hydration: the served markup has to be the arrangement
         * `ChromeSkeleton` draws, or the live viewer moves its chrome on mount.
         * A built-in theme must not be set either — the viewer wears the page's
         * own tokens, and a built-in declared on its root would beat them and
         * put a light island inside a dark page.
         */
        await page.route('**/_app/**', (route) => route.abort());
        await page.goto('/');

        for (const [group, value] of [
            ['controls', 'split'],
            ['nav.edge', 'bottom'],
            ['gallery.open', 'closed'],
            ['theme', 'site'],
        ] as const) {
            await expect(
                page
                    .getByRole('radiogroup', { name: group, exact: true })
                    .getByRole('radio', { checked: true }),
            ).toHaveAttribute('value', value);
        }
    });

    test('keeps gallery controls and the horizontal gallery inside the hero', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/');
        await page.getByRole('button', { name: 'Hold the cycle' }).click();

        const panel = page.locator('.hp');
        const galleryDock = page.getByRole('radiogroup', {
            name: 'gallery.dockPosition',
            exact: true,
        });
        const galleryDockKnob = galleryDock.locator('xpath=../..');
        await expect(galleryDockKnob).toBeVisible();
        const [panelBounds, galleryDockBounds] = await Promise.all([
            panel.boundingBox(),
            galleryDockKnob.boundingBox(),
        ]);
        expect(panelBounds).not.toBeNull();
        expect(galleryDockBounds).not.toBeNull();
        expect(
            (galleryDockBounds as NonNullable<typeof galleryDockBounds>).y +
                (galleryDockBounds as NonNullable<typeof galleryDockBounds>)
                    .height,
        ).toBeLessThanOrEqual(
            (panelBounds as NonNullable<typeof panelBounds>).y +
                (panelBounds as NonNullable<typeof panelBounds>).height,
        );

        await page
            .getByRole('radiogroup', { name: 'gallery.open', exact: true })
            .getByRole('radio', { name: 'open' })
            .click();
        await galleryDock.getByRole('radio', { name: 'top' }).click();

        const viewer = heroViewer(page).locator('.viewer-root');
        const gallery = viewer.locator('.gallery-root');
        await expect(gallery).toBeVisible();

        const bounds = await Promise.all([
            viewer.boundingBox(),
            gallery.boundingBox(),
        ]);
        expect(bounds[0]).not.toBeNull();
        expect(bounds[1]).not.toBeNull();
        const [viewerBounds, galleryBounds] = bounds as [
            NonNullable<(typeof bounds)[0]>,
            NonNullable<(typeof bounds)[1]>,
        ];
        expect(galleryBounds.x).toBeGreaterThanOrEqual(viewerBounds.x);
        expect(galleryBounds.y).toBeGreaterThanOrEqual(viewerBounds.y);
        expect(galleryBounds.x + galleryBounds.width).toBeLessThanOrEqual(
            viewerBounds.x + viewerBounds.width,
        );
        expect(galleryBounds.y + galleryBounds.height).toBeLessThanOrEqual(
            viewerBounds.y + viewerBounds.height,
        );
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
 * The deployment rows at `/production/`, composed from `linkRows` blocks.
 *
 * What makes it worth a browser screen is that each row carries two different
 * links and the two must not collapse into one, and that the page separates a
 * reading room from a tool that ships the viewer. Only rendered output shows
 * either.
 *
 * A group is addressed by the heading it follows: the blocks are siblings in the
 * rendered document, and a `linkRow` carries no attribute saying which kind of
 * entry it is — the block is named for the shape it draws, not for this page's
 * subject.
 */
test.describe('the deployments', () => {
    test('offer a reading room’s landing page and its evidence separately', async ({
        page,
    }) => {
        await page.goto('/production/');
        const rooms = page
            .getByRole('heading', { name: 'Reading rooms running the viewer' })
            .locator('xpath=following-sibling::section[1]')
            .locator('.linkrows__row');

        expect(await rooms.count()).toBeGreaterThan(0);
        for (const row of await rooms.all()) {
            const landing = row.locator('.linkrows__label');
            const example = row.locator('.linkrows__go');
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
            .locator('xpath=following-sibling::section[1]')
            .locator('.linkrows__row');

        await expect(tools.filter({ hasText: 'mkiiif' })).toHaveCount(1);
        await expect(
            page
                .getByRole('heading', {
                    name: 'Reading rooms running the viewer',
                })
                .locator('xpath=following-sibling::section[1]')
                .locator('.linkrows__row')
                .filter({ hasText: 'mkiiif' }),
        ).toHaveCount(0);
    });
});
