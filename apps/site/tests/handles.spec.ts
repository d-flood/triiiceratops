/**
 * `/handles/`, in a browser: five kinds of material, each with a viewer running
 * on somebody's real manifest.
 *
 * Three properties, none of which can be seen anywhere but here. That the page
 * costs what it looks like it costs — nothing below the fold is fetched until it
 * is scrolled to, and nothing moves as the five fill. That each class does in
 * fact resolve its manifest and put the material on a canvas, rather than
 * reserving a box and stopping. And that the embeds are the page's own, in its
 * face and its scheme, in both schemes.
 *
 * These reach other people's IIIF servers, deliberately: the page's whole claim
 * is about material it did not prepare, and an embed served from a fixture would
 * prove the opposite of what the page says. A run with no network fails here,
 * which is the honest result — the page would be broken for a reader too.
 */

import { expect, test, type Page } from '@playwright/test';

import { MATERIAL_CLASSES } from '../src/lib/materialClasses';

const LAST = MATERIAL_CLASSES[MATERIAL_CLASSES.length - 1];

/**
 * What the type split costs this route, and the ceiling for everything that
 * moves outside a reserved box.
 *
 * The material's own labels are in Ge'ez, so the full face is fetched to paint
 * them and the prose re-renders as it swaps in. Measured at about 0.001, which
 * is the price of a split that defers coverage rather than losing it, and this
 * is five times that: twenty times below the 0.1 Lighthouse calls good, and far
 * under what a box that failed to reserve its height would cost.
 */
const FONT_SWAP_SHIFT = 0.005;

function boxes(page: Page) {
    return page.locator('.mat .vw');
}

/** Every URL the page asked for, recorded from the first navigation. */
function recordRequests(page: Page): string[] {
    const seen: string[] = [];
    page.on('request', (request) => seen.push(request.url()));
    return seen;
}

test('reserves a box for every class before anything is fetched', async ({
    page,
}) => {
    // The prerendered document, before a line of this application's script has
    // run: five boxes, each with its height already reserved, or the page
    // shifts as the viewers arrive.
    await page.route('**/_app/**', (route) => route.abort());
    await page.goto('/handles/');

    await expect(boxes(page)).toHaveCount(MATERIAL_CLASSES.length);
    for (let at = 0; at < MATERIAL_CLASSES.length; at += 1) {
        await expect(boxes(page).nth(at)).toHaveCSS(
            'aspect-ratio',
            /^\d+ \/ \d+$/,
        );
    }
});

test('fetches nothing for a class below the fold until it is scrolled to', async ({
    page,
}) => {
    const requested = recordRequests(page);
    await page.goto('/handles/');
    await page.waitForLoadState('load');
    // The embeds start after load, so a settle is needed before the absence
    // below means anything.
    await expect(boxes(page).first().locator('.viewer-root')).toBeAttached();

    expect(
        requested.filter((url) => url === LAST.example.manifest),
        'the last class was fetched without ever being scrolled to',
    ).toEqual([]);

    await boxes(page).last().scrollIntoViewIfNeeded();
    await expect
        .poll(() => requested.filter((url) => url === LAST.example.manifest))
        .not.toEqual([]);
});

test('mounts the viewers over their boxes without moving the page', async ({
    page,
}) => {
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
                seen.push({
                    value: shift.value,
                    outside: (shift.sources ?? []).some(({ node }) => {
                        const element =
                            node instanceof Element
                                ? node
                                : (node?.parentElement ?? null);
                        return (
                            element !== null && element.closest('.vw') === null
                        );
                    }),
                });
            }
        }).observe({ type: 'layout-shift', buffered: true });
    });

    await page.goto('/handles/');
    const reserved = await boxes(page).evaluateAll((all) =>
        all.map((box) => box.getBoundingClientRect().height),
    );

    for (let at = 0; at < MATERIAL_CLASSES.length; at += 1) {
        await boxes(page).nth(at).scrollIntoViewIfNeeded();
        await expect(
            boxes(page).nth(at).locator('.viewer-root'),
        ).toBeAttached();
    }
    // The renderer paints a frame or two after it mounts, and a shift it caused
    // would be recorded then rather than on mount.
    await page.waitForTimeout(2000);

    /*
     * The boxes themselves are the assertion that carries the weight: a box
     * whose height is the same after five renderers have started as it was
     * before any of them existed is the reserved box doing its whole job, and
     * it is exact rather than a tolerance.
     */
    expect(
        await boxes(page).evaluateAll((all) =>
            all.map((box) => box.getBoundingClientRect().height),
        ),
        'a reserved box changed height once its viewer arrived',
    ).toEqual(reserved);

    /*
     * And nothing around them moves, beyond the one thing on this route that
     * does. The viewers' own settling is deliberately not counted: a renderer
     * re-centring its control bar once it knows how many canvases there are is
     * the viewer's internal business, no host can prevent it, and it happens
     * inside a box whose geometry the assertion above holds exactly. What a
     * reader actually loads is measured by the score gate.
     */
    const outside = (
        await page.evaluate(
            () =>
                (
                    window as unknown as {
                        seen: { value: number; outside: boolean }[];
                    }
                ).seen,
        )
    )
        .filter((shift) => shift.outside)
        .reduce((sum, shift) => sum + shift.value, 0);
    expect(outside).toBeLessThanOrEqual(FONT_SWAP_SHIFT);
});

for (const [at, material] of MATERIAL_CLASSES.entries()) {
    test(`${material.name} puts its material on a canvas`, async ({ page }) => {
        await page.goto('/handles/');
        const box = boxes(page).nth(at);
        await box.scrollIntoViewIfNeeded();

        // A canvas exists only once the manifest resolved and named something
        // paintable, so this is the assertion that the class actually works
        // rather than that a box was reserved for it.
        await expect(box.locator('canvas').first()).toBeAttached({
            timeout: 30_000,
        });
        await expect(box).toHaveAttribute('aria-label', material.example.label);
    });
}

test('names no recipe and claims no compliance', async ({ page }) => {
    await page.goto('/handles/');
    const read = await page.locator('.doc').innerText();
    // A recipe id as a reader would read it. Compliance is claimed in one
    // place, and this page answers a different person's question.
    expect(read).not.toMatch(/\d{4}-[a-z]/);
    expect(read.toLowerCase()).not.toContain('supported');
});

test('is set in the page’s own face and turns with the page’s own scheme', async ({
    page,
}) => {
    /*
     * The surfaces are read back as colours through a probe element rather than
     * as custom properties. `themeConfig` sets the viewer's tokens to
     * `var(--site-token)`, so reading one returns that text rather than a
     * colour; a probe resolves the cascade where it stands and reports what a
     * reader would actually see. The probe is written out twice because each
     * runs in the page, where nothing in this file exists.
     */
    const surfaces = new Set<string>();
    for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto('/handles/');
        const viewer = boxes(page).first().locator('.viewer-root');
        await expect(viewer).toBeAttached();

        const [face, pageFace, surface, pageSurface] = await Promise.all([
            viewer.evaluate((el) => getComputedStyle(el).fontFamily),
            page.evaluate(() => getComputedStyle(document.body).fontFamily),
            viewer.evaluate((el) => {
                const probe = document.createElement('div');
                probe.style.color = 'var(--tri-toolbar-bg)';
                el.appendChild(probe);
                const seen = getComputedStyle(probe).color;
                probe.remove();
                return seen;
            }),
            page.evaluate(() => {
                const probe = document.createElement('div');
                probe.style.color = 'var(--paper)';
                document.body.appendChild(probe);
                const seen = getComputedStyle(probe).color;
                probe.remove();
                return seen;
            }),
        ]);
        expect(face, scheme).toBe(pageFace);
        expect(surface, scheme).toBe(pageSurface);
        surfaces.add(surface);
    }
    // Two schemes, two surfaces: one colour for both would satisfy everything
    // above and mean the toggle never reached the viewer.
    expect(surfaces.size).toBe(2);
});
