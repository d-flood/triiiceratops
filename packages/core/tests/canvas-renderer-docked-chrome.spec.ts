/**
 * **Docked chrome and the reader's view**: what happens to the projection when
 * CORE takes part of the viewer surface for a panel column.
 *
 * A resize is not one event. A window resize preserves the reader's scale — they
 * chose that view and nothing was taken from them — while docked chrome takes
 * ~320px of the very surface the projection was sized against. That surface
 * change is *compensated*, not re-fitted: the canvas-space extent visible on the
 * axis that changed is preserved and the centre does not move, floored and
 * ceiled so that a reader who had the whole canvas still has it. Nothing new can
 * overhang `.viewer-area`, which matters because the overlay layer's
 * `overflow: hidden` clips an overhang out of both the picture and the hit test,
 * taking canvas-anchored chrome with it.
 *
 * These tests hold the two cases apart on BOTH axes — a bottom-docked gallery
 * takes height the same way a panel column takes width — and check that
 * canvas-anchored chrome over a viewer with a panel docked is still operable.
 *
 * A note on what discriminates. The two "stays inside the surface" specs below
 * open at the HOME view, where the reader is already at the fit; the
 * compensation keeps them at the fit and an absolute re-fit would land there
 * too, so those specs pass under either rule and are anti-overhang coverage
 * only. `a zoomed-in reader keeps their view when a panel docks` is the one that
 * tells the rules apart, and it is the reader-facing symptom the compensation
 * exists to fix.
 *
 * Browser-only by construction: the whole claim is about laid-out column widths
 * and hit testing.
 */

import { expect, test, type Page } from '@playwright/test';

import { AV_MANIFESTS } from './helpers/avMedia';
import { serveAvPluginDist } from './helpers/avPluginDist';
import { getView, setView } from './helpers/numberedGrid';
import { settled, settledBox } from './helpers/settle';

const FIXTURE = '/e2e/canvas-renderer-wc.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const VIEWER_AREA = '.viewer-area';

/** The AV plugin's transport, its leftmost control, and the element it drives. */
const TRANSPORT = '[data-testid="transport"]';
const TRANSPORT_PLAY = '[data-testid="transport-play"]';
const TRANSPORT_MUTE = '[data-testid="transport-mute"]';
const AV_MEDIA = '[data-testid="av-media"]';

/** A canvas-space point, as the coordinate helpers hand it back. */
type Point = { x: number; y: number };

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer specs are Chromium-only.',
);

async function openFixture(page: Page): Promise<void> {
    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    // The first fit has landed once the renderer reports a scale.
    await expect
        .poll(async () => (await getView(page)).scale, { timeout: 20_000 })
        .toBeGreaterThan(0);
}

/** Open or close a core panel through viewer state, not through the chrome. */
async function setMetadataPanel(page: Page, open: boolean): Promise<void> {
    await page.evaluate((value) => {
        const host = document.getElementById('v') as unknown as {
            viewerState: { showMetadataPanel: boolean };
        };
        host.viewerState.showMetadataPanel = value;
    }, open);
}

/** The width of the current canvas as it is projected on screen, in CSS px. */
async function projectedWidth(page: Page): Promise<number> {
    return page.evaluate(() => {
        const host = document.getElementById('v') as unknown as {
            viewerState: {
                canvasSize(): { width: number; height: number } | null;
                canvasToScreen(point: {
                    x: number;
                    y: number;
                }): { x: number; y: number } | null;
            };
        };
        const size = host.viewerState.canvasSize();
        if (!size) return 0;
        const left = host.viewerState.canvasToScreen({ x: 0, y: 0 });
        const right = host.viewerState.canvasToScreen({ x: size.width, y: 0 });
        return left && right ? right.x - left.x : 0;
    });
}

async function areaWidth(page: Page): Promise<number> {
    return (await page.locator(VIEWER_AREA).boundingBox())?.width ?? 0;
}

async function areaHeight(page: Page): Promise<number> {
    return (await page.locator(VIEWER_AREA).boundingBox())?.height ?? 0;
}

/** The height of the current canvas as projected on screen, in CSS px. */
async function projectedHeight(page: Page): Promise<number> {
    return page.evaluate(() => {
        const host = document.getElementById('v') as unknown as {
            viewerState: {
                canvasSize(): { width: number; height: number } | null;
                canvasToScreen(point: {
                    x: number;
                    y: number;
                }): { x: number; y: number } | null;
            };
        };
        const size = host.viewerState.canvasSize();
        if (!size) return 0;
        const top = host.viewerState.canvasToScreen({ x: 0, y: 0 });
        const bottom = host.viewerState.canvasToScreen({
            x: 0,
            y: size.height,
        });
        return top && bottom ? bottom.y - top.y : 0;
    });
}

/**
 * The two coordinate helpers a canvas-anchored consumer works in, read off the
 * viewer element itself rather than the fixture's `#v` so they serve the
 * harness page too. Both share `.viewer-area`'s origin.
 */
async function screenToCanvas(page: Page, point: Point): Promise<Point | null> {
    return page.evaluate((p) => {
        const host = document.querySelector(
            'triiiceratops-viewer',
        ) as unknown as {
            viewerState: { screenToCanvas(point: Point): Point | null };
        };
        return host.viewerState.screenToCanvas(p);
    }, point);
}

async function canvasToScreen(page: Page, point: Point): Promise<Point | null> {
    return page.evaluate((p) => {
        const host = document.querySelector(
            'triiiceratops-viewer',
        ) as unknown as {
            viewerState: { canvasToScreen(point: Point): Point | null };
        };
        return host.viewerState.canvasToScreen(p);
    }, point);
}

test('docking a panel keeps the canvas inside the narrowed viewer area', async ({
    page,
}) => {
    await openFixture(page);

    const fullArea = await areaWidth(page);
    const fullProjection = await projectedWidth(page);
    // Anti-vacuity: the canvas really does fill the un-narrowed viewer, so a
    // preserved projection would be far too wide for the column that follows.
    expect(fullProjection).toBeGreaterThan(fullArea / 2);

    await setMetadataPanel(page, true);
    await expect
        .poll(() => areaWidth(page), { timeout: 20_000 })
        .toBeLessThan(fullArea - 100);
    // Read the area and the projection in ONE settled sample, so the ±1px
    // assertion below compares two numbers from the same moment.
    const open = await settled(page, async (p) => ({
        area: await areaWidth(p),
        projection: await projectedWidth(p),
    }));

    expect(open.projection).toBeLessThan(fullProjection);
    // The whole point: the projection is inside the surface that is left, not
    // hanging off the side of it. A pixel of tolerance, like every other
    // geometric assertion in this suite.
    expect(open.projection).toBeLessThanOrEqual(open.area + 1);

    // …and the surface is given back when the panel closes.
    await setMetadataPanel(page, false);
    await expect
        .poll(() => projectedWidth(page), { timeout: 20_000 })
        .toBeGreaterThan(open.area + 1);
});

test('a zoomed-in reader keeps their view when a panel docks', async ({
    page,
}) => {
    await openFixture(page);

    const home = await settled(page, async (p) => ({
        view: await getView(p),
        area: await areaWidth(p),
    }));

    // A reader who chose this view: zoomed past the fit and panned off-centre.
    // Set rather than gestured — reaching it by wheel would make the assertion
    // depend on an animation settling, which is tested elsewhere.
    await setView(page, {
        scale: home.view.scale * 3,
        centre: {
            x: home.view.centre.x * 1.15,
            y: home.view.centre.y * 1.15,
        },
    });

    const before = await settled(page, async (p) => ({
        view: await getView(p),
        area: await areaWidth(p),
    }));
    // Anti-vacuity: they really are zoomed in, so a re-fit would be a visible
    // jump rather than a no-op. This is what the home-view specs cannot say.
    expect(before.view.scale).toBeGreaterThan(home.view.scale * 2);

    await setMetadataPanel(page, true);
    await expect
        .poll(() => areaWidth(page), { timeout: 20_000 })
        .toBeLessThan(before.area - 100);

    const after = await settled(page, async (p) => ({
        view: await getView(p),
        area: await areaWidth(p),
    }));

    // The rule, in the reader's terms: the canvas-space extent visible on the
    // axis that changed survives the narrowing, and the centre is a canvas-space
    // point so it does not move at all.
    expect(after.area / after.view.scale).toBeCloseTo(
        before.area / before.view.scale,
        0,
    );
    expect(after.view.centre.x).toBeCloseTo(before.view.centre.x, 0);
    expect(after.view.centre.y).toBeCloseTo(before.view.centre.y, 0);
    // And emphatically not thrown back to the home view, which is the symptom
    // this whole behaviour exists to prevent.
    expect(after.view.scale).toBeGreaterThan(home.view.scale * 1.5);
});

test('a plain window resize still preserves the reader’s scale', async ({
    page,
}) => {
    await openFixture(page);

    const before = await getView(page);
    const startWidth = await areaWidth(page);

    await page.evaluate(() => {
        (document.getElementById('v') as HTMLElement).style.width = '520px';
    });
    await expect
        .poll(() => areaWidth(page), { timeout: 20_000 })
        .toBeLessThan(startWidth - 100);

    // Preserved, not re-fitted: the reader chose this view and the window
    // getting smaller is not core taking the surface away.
    expect((await getView(page)).scale).toBeCloseTo(before.scale, 5);
});

test('the toolbar’s buttons are still clickable with a panel docked', async ({
    page,
}) => {
    await openFixture(page);
    // The toolbar is collapsed in this fixture, and a collapsed shell parks
    // itself off the edge of the viewer area on purpose — its buttons are not
    // meant to be reachable. Open it, so what is measured is a toolbar that
    // claims to be operable.
    await page.evaluate(() => {
        const host = document.getElementById('v') as unknown as {
            viewerState: { toolbarOpen: boolean; showMetadataPanel: boolean };
        };
        host.viewerState.toolbarOpen = true;
        host.viewerState.showMetadataPanel = true;
    });
    await expect(page.locator('.side-col')).toBeVisible({ timeout: 20_000 });
    // The column slides open; clicking mid-slide would measure the animation.
    await expect
        .poll(() => areaWidth(page), { timeout: 20_000 })
        .toBeLessThan(600);

    // Clicked with no `force`: a control that is covered, clipped away, or
    // pushed off the surface fails here rather than passing silently.
    await page.locator('[data-panel-toggle="metadata"]').click({
        timeout: 20_000,
    });

    await expect
        .poll(
            () =>
                page.evaluate(
                    () =>
                        (
                            document.getElementById('v') as unknown as {
                                viewerState: { showMetadataPanel: boolean };
                            }
                        ).viewerState.showMetadataPanel,
                ),
            { timeout: 20_000 },
        )
        .toBe(false);
});

test('docking a gallery to the BOTTOM keeps the canvas inside the shortened viewer area', async ({
    page,
}) => {
    await openFixture(page);

    const fullHeight = await areaHeight(page);
    const fullProjection = await projectedHeight(page);
    // Anti-vacuity: the canvas really does fill the un-shortened viewer.
    expect(fullProjection).toBeGreaterThan(fullHeight / 2);

    // `dockSide` DEFAULTS to 'bottom', so this is not an exotic configuration —
    // it is what a host that never touched the setting gets. A band across the
    // bottom takes height rather than width, and height is the axis the AV
    // transport anchors itself to, so an overhang here puts the transport
    // outside the surface exactly as a left column does.
    await page.evaluate(() => {
        const host = document.getElementById('v') as unknown as {
            viewerState: {
                showThumbnailGallery: boolean;
                galleryExpanded: boolean;
                dockSide: string;
            };
        };
        host.viewerState.dockSide = 'bottom';
        host.viewerState.galleryExpanded = false;
        host.viewerState.showThumbnailGallery = true;
    });
    await expect
        .poll(() => areaHeight(page), { timeout: 20_000 })
        .toBeLessThan(fullHeight - 50);

    const open = await settled(page, async (p) => ({
        area: await areaHeight(p),
        projection: await projectedHeight(p),
    }));

    expect(open.projection).toBeLessThan(fullProjection);
    expect(open.projection).toBeLessThanOrEqual(open.area + 1);
});

test('a host resize moments after a panel toggle still preserves scale', async ({
    page,
}) => {
    // Reduced motion so the column arrives in one step: the re-fit is then over
    // within a frame or two of the toggle, and everything after it is a plain
    // resize with no ambiguity about which case it belongs to.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFixture(page);

    // Deep enough that a re-fit would be unmistakable rather than a rounding
    // difference.
    await page.evaluate(() => {
        const host = document.getElementById('v') as unknown as {
            viewerState: { zoomTo(scale: number): void };
        };
        host.viewerState.zoomTo(4);
    });

    // The toggle, the settle, and the resize all inside one page task, so the
    // resize genuinely lands within a few frames of the toggle. Driving it from
    // Playwright instead would put hundreds of milliseconds between them and
    // test nothing: a re-fit window measured on the CLOCK swallowed the resize
    // for as long as it stood, and this is the case that caught it.
    const seen = await page.evaluate(async () => {
        const element = document.getElementById('v') as HTMLElement;
        const host = element as unknown as {
            viewerState: {
                showMetadataPanel: boolean;
                readonly viewportScale: number;
            };
        };
        const frame = () =>
            new Promise((resolve) => requestAnimationFrame(resolve));

        host.viewerState.showMetadataPanel = true;
        // Enough frames for the column to arrive and the re-fit to settle,
        // few enough to stay well inside any plausible timeout.
        for (let i = 0; i < 6; i += 1) await frame();

        const afterRefit = host.viewerState.viewportScale;
        element.style.width = '600px';
        for (let i = 0; i < 6; i += 1) await frame();
        return { afterRefit, afterResize: host.viewerState.viewportScale };
    });

    // The panel took the surface, so the canvas was re-fitted — but the window
    // getting smaller straight afterwards is the OTHER case, and the reader's
    // scale survives it. Collapsing the two is what this pins against.
    expect(seen.afterResize).toBeCloseTo(seen.afterRefit, 5);
});

/**
 * **The real application, driven the way a reader drives it.**
 *
 * Everything above runs against `/e2e/canvas-renderer-wc.html` — a bare custom
 * element with no host around it. That fixture reported the compensation
 * working for a whole epic while the shipped application threw a zoomed reader
 * back to the home view on every panel toggle, because the trigger is the whole
 * application shell: a viewer handed a `config` object that carries the chrome's
 * open state, with the docked panels and the unified bar really present around
 * the surface.
 *
 * So these cases navigate to `/e2e/harness.html`, which mounts exactly that and
 * nothing else, reach the reader's view by real wheel and drag input, and press
 * the toolbar's own buttons. What they assert is what the reader sees: the scale
 * and centre they chose, before and after.
 *
 * The whole class is covered here, not just the reported panel: every piece of
 * chrome the `config` object carries, on both axes, and on a claimed
 * time-based-media canvas. The structures panel is deliberately absent — none of
 * these cases toggles it, so it is the control rather than a gap.
 *
 * They are the reader-facing statement, not a unit test of any one mechanism.
 * Two independent defects produced the reset — an unconditional world-refit and
 * a config-backed viewer-state read that woke on the object rather than on its
 * value — and removing either one is enough to make these pass. The refit's
 * idempotence is pinned on its own in
 * `src/lib/renderer/canvasRenderer.idempotentRefit.svelte.test.ts`.
 */
test.describe('the real application — a reader keeps their place', () => {
    /*
     * Three uniform canvases, served locally, opening in `individuals` mode.
     * Both of the "a genuine refit still happens" cases need that: the second
     * canvas has a neighbour to be paired with, so switching to `paged` is a
     * change of world with a visibly different spread, and no manifest
     * behaviour has already chosen the mode for us.
     */
    const APP = '/e2e/harness.html?manifest=/demo-manifests/a11y/manifest.json';

    /**
     * A claimed time-based-media canvas on the same page: one Video canvas, the
     * AV plugin registered on the harness like any other first-party plugin,
     * and the transport it registers rendered in the control bar.
     *
     * The dev server resolves `@triiiceratops/plugin-av` to the plugin's BUILT
     * dist (`vite.config.ts`), so this needs `pnpm build:all` like the AV
     * describe below — without it the transport never appears and the wait
     * times out.
     */
    const AV_APP = `/e2e/harness.html?manifest=${AV_MANIFESTS.video}`;

    /** The toolbar's "n / total" canvas indicator. */
    const NAV_INDEX = '.nav-index';

    /** The reader's view and the width of the column it is measured against. */
    async function reader(page: Page) {
        return settled(page, async (p) => ({
            view: await getView(p),
            area: await areaWidth(p),
        }));
    }

    /** The same, on the axis a top- or bottom-docked band takes from. */
    async function readerVertical(page: Page) {
        return settled(page, async (p) => ({
            view: await getView(p),
            area: await areaHeight(p),
        }));
    }

    async function openApp(page: Page, url = APP): Promise<void> {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });
        await expect
            .poll(async () => (await getView(page)).scale, { timeout: 20_000 })
            .toBeGreaterThan(0);
    }

    /**
     * Zoom past the fit and pan off-centre with real input.
     *
     * Gestured rather than set through the test handle, unlike the fixture
     * specs above: the claim here is about the application a reader touches, and
     * a view reached by wheel and drag is the one they arrive at. The reads that
     * follow are settled, so the easing is waited out rather than raced.
     */
    async function zoomAndPan(page: Page): Promise<void> {
        const box = await settledBox(page, SURFACE);
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        await page.mouse.move(x, y);
        for (let i = 0; i < 6; i += 1) {
            await page.mouse.wheel(0, -240);
            await page.waitForTimeout(60);
        }

        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x - 120, y - 80, { steps: 12 });
        await page.mouse.up();
    }

    function toolbarButton(page: Page, name: string) {
        return page.getByRole('button', { name, exact: true }).first();
    }

    /**
     * Press Info and wait for the column to finish taking or giving back the
     * width, so that every read afterwards is of the settled surface.
     */
    async function toggleInformation(
        page: Page,
        narrowed: boolean,
        fullWidth: number,
    ): Promise<void> {
        await toolbarButton(page, 'Toggle Information').click();
        const width = expect.poll(() => areaWidth(page), { timeout: 20_000 });
        if (narrowed) await width.toBeLessThan(fullWidth - 100);
        else await width.toBeGreaterThanOrEqual(fullWidth);
    }

    test('a zoomed-in reader keeps their view when the information panel docks', async ({
        page,
    }) => {
        await openApp(page);
        const home = await reader(page);

        await zoomAndPan(page);
        const before = await reader(page);
        // Anti-vacuity: a reader at the fit would land on the fit either way.
        expect(before.view.scale).toBeGreaterThan(home.view.scale * 2);

        await toggleInformation(page, true, before.area);
        const after = await reader(page);

        // The compensation's rule, and this time it is what the reader is left
        // with rather than what was computed and then overwritten: the
        // canvas-space extent across the narrowed axis survives, and the centre
        // is a canvas-space point, so it does not move at all.
        expect(after.area / after.view.scale).toBeCloseTo(
            before.area / before.view.scale,
            0,
        );
        expect(after.view.centre.x).toBeCloseTo(before.view.centre.x, 0);
        expect(after.view.centre.y).toBeCloseTo(before.view.centre.y, 0);
        // And emphatically not the home view, which is where the unconditional
        // refit put them: home scale, home centre, exactly.
        expect(after.view.scale).toBeGreaterThan(home.view.scale * 1.5);
    });

    test('closing the information panel again leaves the reader where they were', async ({
        page,
    }) => {
        await openApp(page);
        const home = await reader(page);

        await zoomAndPan(page);
        const before = await reader(page);
        expect(before.view.scale).toBeGreaterThan(home.view.scale * 2);

        await toggleInformation(page, true, before.area);
        await toggleInformation(page, false, before.area);
        const after = await reader(page);

        // Consulting a panel and dismissing it costs the reader nothing: the
        // surface is the width it was, so the compensation composes back to the
        // view they had.
        expect(after.view.scale).toBeCloseTo(before.view.scale, 2);
        expect(after.view.centre.x).toBeCloseTo(before.view.centre.x, 0);
        expect(after.view.centre.y).toBeCloseTo(before.view.centre.y, 0);
    });

    test('navigating to another canvas in the real application still frames it', async ({
        page,
    }) => {
        await openApp(page);
        const home = await reader(page);

        await zoomAndPan(page);
        const before = await reader(page);
        expect(before.view.scale).toBeGreaterThan(home.view.scale * 2);

        await toolbarButton(page, 'Next Canvas').click();
        // Anti-vacuity: the click really did move the reader to another canvas.
        // Its rects are the same size as the first one's, so nothing about the
        // view could say so on its own.
        await expect(page.locator(NAV_INDEX)).toHaveText('2 / 3');
        const after = await reader(page);

        // A different canvas is a different world, so the reader is reframed —
        // guarding the refit must not cost navigation its fit. The canvases in
        // this manifest are the same size, so the fit is the home one.
        expect(after.view.scale).toBeCloseTo(home.view.scale, 5);
        expect(after.view.centre.x).toBeCloseTo(home.view.centre.x, 0);
        expect(after.view.centre.y).toBeCloseTo(home.view.centre.y, 0);
    });

    test('a viewing-mode change in the real application still refits', async ({
        page,
    }) => {
        await openApp(page);
        const home = await reader(page);

        // On the SECOND canvas, which `paged` pairs with the third — the first
        // stands alone, so a mode change there would lay out the same rects and
        // could not tell a refit from a no-op.
        await toolbarButton(page, 'Next Canvas').click();
        await expect(page.locator(NAV_INDEX)).toHaveText('2 / 3');

        await zoomAndPan(page);
        const before = await reader(page);
        expect(before.view.scale).toBeGreaterThan(home.view.scale * 2);

        await toolbarButton(page, 'Viewing Mode').click();
        await page
            .getByRole('menuitemradio', { name: 'Paged', exact: true })
            .first()
            .click();
        const after = await reader(page);

        // A change of mode is a change of world too: the reader is refitted
        // rather than left at the zoom they had for the previous layout…
        expect(after.view.scale).toBeLessThan(before.view.scale / 2);
        // …and refitted to the SPREAD, whose centre is well to the right of the
        // canvas centre the reader was framed on while it was alone on screen.
        expect(after.view.centre.x).toBeGreaterThan(home.view.centre.x * 1.5);
    });

    test('toggling the toolbar leaves the reader’s view exactly as it was', async ({
        page,
    }) => {
        await openApp(page);
        const home = await reader(page);

        await zoomAndPan(page);
        const before = await reader(page);
        expect(before.view.scale).toBeGreaterThan(home.view.scale * 2);

        // The unified bar's collapse toggle, which is the control a reader has:
        // it writes `toolbarOpen`, the host mirrors that into its configuration
        // and hands the object back, and the viewer adopts it.
        const fullHeight = await areaHeight(page);
        await toolbarButton(page, 'Close Menu').click();
        await expect(toolbarButton(page, 'Open Menu')).toBeVisible({
            timeout: 20_000,
        });
        const collapsed = await reader(page);

        await toolbarButton(page, 'Open Menu').click();
        await expect(toolbarButton(page, 'Close Menu')).toBeVisible({
            timeout: 20_000,
        });
        const reopened = await reader(page);

        // The bar collapses within the control row and takes none of the
        // surface, so there is nothing to compensate for and nothing to round:
        // the reader's view is not merely close, it is untouched. Anything else
        // means the toggle reached the projection, which is the whole defect.
        // Both axes, so that a collapse which quietly changed the bar's HEIGHT
        // is reported as the surface moving rather than as a scale mismatch
        // three lines further down.
        expect(collapsed.area).toBe(before.area);
        expect(await areaHeight(page)).toBe(fullHeight);
        expect(collapsed.view.scale).toBeCloseTo(before.view.scale, 5);
        expect(collapsed.view.centre.x).toBeCloseTo(before.view.centre.x, 5);
        expect(collapsed.view.centre.y).toBeCloseTo(before.view.centre.y, 5);
        expect(reopened.view.scale).toBeCloseTo(before.view.scale, 5);
        expect(reopened.view.centre.x).toBeCloseTo(before.view.centre.x, 5);
        expect(reopened.view.centre.y).toBeCloseTo(before.view.centre.y, 5);
    });

    test('docking the thumbnail gallery beside the canvas keeps the framed content', async ({
        page,
    }) => {
        await openApp(page);
        const home = await reader(page);

        await zoomAndPan(page);
        const before = await reader(page);
        expect(before.view.scale).toBeGreaterThan(home.view.scale * 2);

        // Placed to the LEFT so the band takes width, which is the axis
        // `reader` measures; choosing a side both docks and reveals the
        // gallery. The placement is a host round-trip too — the demo mirrors
        // `dockSide` into `gallery.dockPosition` — so this click is an instance
        // of that pattern as well.
        await toolbarButton(page, 'Gallery').click();
        await page
            .getByRole('menuitemradio', { name: 'Left', exact: true })
            .first()
            .click();
        await expect
            .poll(() => areaWidth(page), { timeout: 20_000 })
            .toBeLessThan(before.area - 50);
        const after = await reader(page);

        // Browsing thumbnails is not a navigation: the band narrows the
        // surface, so the compensation trades scale for the width it took and
        // the canvas-space extent across that axis survives intact.
        expect(after.area / after.view.scale).toBeCloseTo(
            before.area / before.view.scale,
            0,
        );
        expect(after.view.centre.x).toBeCloseTo(before.view.centre.x, 0);
        expect(after.view.centre.y).toBeCloseTo(before.view.centre.y, 0);
        expect(after.view.scale).toBeGreaterThan(home.view.scale * 1.5);
    });

    test('a bottom-docked gallery band preserves the reader’s vertical position', async ({
        page,
    }) => {
        await openApp(page);
        const home = await readerVertical(page);

        await zoomAndPan(page);
        const before = await readerVertical(page);
        expect(before.view.scale).toBeGreaterThan(home.view.scale * 2);

        // `bottom` is the default placement, so this is the phone-shaped case a
        // host gets without configuring anything: the band takes HEIGHT, and
        // the compensation has to answer on that axis exactly as it does on
        // width. Nothing else in this suite drives the vertical axis through
        // the real application.
        await toolbarButton(page, 'Gallery').click();
        await page
            .getByRole('menuitemradio', { name: 'Bottom', exact: true })
            .first()
            .click();
        await expect
            .poll(() => areaHeight(page), { timeout: 20_000 })
            .toBeLessThan(before.area - 50);
        const after = await readerVertical(page);

        expect(after.area / after.view.scale).toBeCloseTo(
            before.area / before.view.scale,
            0,
        );
        expect(after.view.centre.x).toBeCloseTo(before.view.centre.x, 0);
        expect(after.view.centre.y).toBeCloseTo(before.view.centre.y, 0);
        expect(after.view.scale).toBeGreaterThan(home.view.scale * 1.5);
    });

    /**
     * Record the reader's scale against the surface it was composed in, once
     * per PAINT, for the duration of one interaction.
     *
     * Every other spec here reads the SETTLED view, which is blind to what the
     * reader sees on the way: the compensation can arrive at exactly the right
     * answer and still get there by a visible jump.
     *
     * Sampling happens inside a registered paint layer, whose `draw` the
     * renderer calls while painting the frame. That seam is the whole point.
     * An animation-frame callback cannot stand in for it: callbacks run in
     * registration order, so one registered here reports the view either a
     * frame stale or before the renderer has compensated, and a value written
     * and overwritten between two callbacks of the SAME frame is never painted
     * at all — invisible to the reader, and so not a defect.
     */
    type Frame = { frameId: number; surface: number; scale: number };

    async function startTracking(page: Page): Promise<void> {
        await page.locator(SURFACE).evaluate((surface) => {
            const host = surface as HTMLCanvasElement & {
                __triiiceratopsRenderer?: {
                    getView(): { scale: number };
                    registerPaintLayer(layer: {
                        id: string;
                        draw: () => void;
                    }): () => void;
                };
            };
            const handle = host.__triiiceratopsRenderer;
            if (!handle) throw new Error('renderer test handle not installed');
            type Frame = { frameId: number; surface: number; scale: number };
            const w = window as unknown as {
                __frames?: Frame[];
                __framesStop?: () => void;
            };
            const out: Frame[] = [];
            w.__frames = out;
            // A frame counter, so paints can be grouped by the frame they
            // belong to: a frame may be painted more than once (the loop, then
            // again from the ResizeObserver after a resize), and only the LAST
            // paint of a frame is the one composited and seen.
            let frameId = 0;
            let ticking = true;
            const bump = () => {
                if (!ticking) return;
                frameId += 1;
                requestAnimationFrame(bump);
            };
            requestAnimationFrame(bump);
            const release = handle.registerPaintLayer({
                id: 'e2e:flash-probe',
                draw: () => {
                    out.push({
                        frameId,
                        surface: host.getBoundingClientRect().width,
                        scale: handle.getView().scale,
                    });
                },
            });
            w.__framesStop = () => {
                ticking = false;
                release();
            };
        });
    }

    async function stopTracking(page: Page): Promise<Frame[]> {
        return page.evaluate(() => {
            type Frame = { frameId: number; surface: number; scale: number };
            const w = window as unknown as {
                __frames?: Frame[];
                __framesStop?: () => void;
            };
            w.__framesStop?.();
            return w.__frames ?? [];
        }) as Promise<Frame[]>;
    }

    test('the reader’s view slides with the column instead of flashing to the end state', async ({
        page,
    }) => {
        await openApp(page);
        const home = await reader(page);

        await zoomAndPan(page);
        const before = await reader(page);
        expect(before.view.scale).toBeGreaterThan(home.view.scale * 2);

        await startTracking(page);
        await toolbarButton(page, 'Toggle Information').click();
        await expect
            .poll(() => areaWidth(page), { timeout: 20_000 })
            .toBeLessThan(before.area - 100);
        // Past the end of the slide, so the trace covers the whole animation.
        await page.waitForTimeout(600);
        const frames = await stopTracking(page);

        // Anti-vacuity: an empty trace satisfies the assertion below, and an
        // empty trace is exactly what a mis-wired sampler produces.
        expect(frames.length).toBeGreaterThan(10);

        // The compensation holds the visible canvas-space extent, so across the
        // whole slide `surface / scale` is the one number that does not move.
        //
        // Matched against the current surface OR the previous painted one,
        // because the renderer paints a frame before that frame's compensation
        // lands: the paint runs in an animation-frame callback and `measure()`
        // reaches it from the ResizeObserver afterwards, so the painted scale
        // trails the column by exactly one frame for the whole slide. That lag
        // is a real and separate defect — pinning it as correct here is not the
        // claim; what this spec rejects is a JUMP, which no amount of lag
        // explains. The defect it was written for painted the FINAL scale into
        // the STILL-FULL-WIDTH surface, one frame before the column had moved.
        // The compensation holds the visible canvas-space extent, so across the
        // whole slide `surface / scale` is the one number that does not move.
        //
        // Asserted only over the LAST paint of each frame. A frame is painted
        // twice while the column moves — once by the frame loop, then again
        // from the ResizeObserver after the resize — and only the second
        // reaches the screen. Judging every paint instead reads the discarded
        // first one as a one-frame lag that no reader can see.
        const extent = before.area / before.view.scale;
        const composited = frames.filter(
            (frame, index) =>
                index === frames.length - 1 ||
                frames[index + 1].frameId !== frame.frameId,
        );
        expect(composited.length).toBeGreaterThan(5);
        const jumped = composited.filter(
            (frame) =>
                Math.abs(frame.surface / frame.scale - extent) / extent > 0.02,
        );
        expect(jumped).toEqual([]);
    });

    /**
     * The same application with the information panel on the toolbar's OWN
     * side, which is what docks the toolbar as the panel column's screen-edge
     * rail rather than leaving it floating over the image.
     */
    const SAME_SIDE_APP = `${APP}&config=${encodeURIComponent(
        JSON.stringify({
            information: {
                open: false,
                position: 'left',
                showButton: true,
                showCloseButton: true,
            },
        }),
    )}`;

    /** Sample `.viewer-area`'s width once per frame, for one interaction. */
    async function startWidthTrack(page: Page): Promise<void> {
        await page.locator(VIEWER_AREA).evaluate((area) => {
            const w = window as unknown as {
                __widths?: number[];
                __widthsStop?: () => void;
            };
            const out: number[] = [];
            w.__widths = out;
            let running = true;
            const tick = () => {
                if (!running) return;
                out.push(area.getBoundingClientRect().width);
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            w.__widthsStop = () => {
                running = false;
            };
        });
    }

    async function stopWidthTrack(page: Page): Promise<number[]> {
        return page.evaluate(() => {
            const w = window as unknown as {
                __widths?: number[];
                __widthsStop?: () => void;
            };
            w.__widthsStop?.();
            return w.__widths ?? [];
        }) as Promise<number[]>;
    }

    test('a same-side panel gives the surface back on one curve, with no last-frame lurch', async ({
        page,
    }) => {
        await openApp(page, SAME_SIDE_APP);
        const full = await areaWidth(page);

        await toggleInformation(page, true, full);
        // Anti-vacuity, and the whole premise of the case: with the panel on
        // the toolbar's other side there is no rail, and this is an ordinary
        // panel close that never had the defect.
        await expect(page.locator('.toolbar-rail-host.rail-col')).toBeVisible();
        // Settled, so the trace below starts from a still surface and the
        // travel it is measured against is the whole of it.
        const narrowed = await settled(page, areaWidth);
        const travel = full - narrowed;
        expect(travel).toBeGreaterThan(100);

        await startWidthTrack(page);
        await toolbarButton(page, 'Toggle Information').click();
        await expect
            .poll(() => areaWidth(page), { timeout: 20_000 })
            .toBeGreaterThanOrEqual(full);
        // Past the end of the slide, so the trace covers the whole close.
        await page.waitForTimeout(600);
        const widths = await stopWidthTrack(page);

        // Anti-vacuity: an empty trace satisfies the assertion below.
        expect(widths.length).toBeGreaterThan(10);

        // `cubicOut` decelerates to a stop, so a frame that moves the surface
        // by only a few pixels means the slide is all but over — and nothing
        // may move it appreciably after that. What this rejects is a column
        // that holds its width through the whole slide and then vanishes: the
        // docked rail used to unmount on a timer once the panel beside it had
        // finished, handing the surface its last ~37px in a single frame, at
        // the one moment the eye is following a curve that has nearly stopped.
        //
        // Both bounds are in pixels rather than fractions of the travel,
        // because both are claims about what a reader sees: the tail of an
        // eased slide runs at 4px a frame and under, and a jump of 12px is
        // visible however wide the column was. The margin either side is wide
        // enough that a dropped frame, which merges two deltas into one,
        // cannot reach it.
        const deltas: number[] = [];
        for (let i = 1; i < widths.length; i += 1) {
            deltas.push(widths[i] - widths[i - 1]);
        }
        const tail = deltas.findIndex((delta) => delta > 0 && delta < 5);
        expect(tail).toBeGreaterThan(0);
        expect(deltas.slice(tail + 1).filter((delta) => delta > 12)).toEqual(
            [],
        );
    });

    /**
     * A tiled manifest, because this spec reads PIXELS: the accessibility
     * fixture's canvases are flat colour, so a blank surface and a painted one
     * are the same measurement there. The numbered grid has structure at every
     * scale, and a canvas that is not painted collapses its spread to zero.
     */
    const TILED_APP =
        '/e2e/harness.html?manifest=/demo-manifests/tiled/manifest.json';

    /**
     * Measure the surface's painted content once per frame, at the END of the
     * frame, for the duration of one interaction.
     *
     * Both halves of that matter. Resizing a canvas's backing store clears it,
     * and `measure()` does exactly that from a ResizeObserver — which runs
     * after the frame loop has painted and before the browser composites. So a
     * cleared-and-not-repainted surface is visible only to a task scheduled
     * from inside the frame callback: sample in the callback itself, or read
     * the backing store at the start of the next frame, and the clear has
     * either not happened yet or been painted over, and the spec passes over a
     * viewer that blanks on every frame of the slide.
     */
    async function startBlankWatch(page: Page): Promise<void> {
        await page.locator(SURFACE).evaluate((surface) => {
            const host = surface as HTMLCanvasElement;
            const w = window as unknown as {
                __spread?: number[];
                __spreadStop?: () => void;
            };
            const out: number[] = [];
            w.__spread = out;
            const off = document.createElement('canvas');
            off.width = 32;
            off.height = 32;
            const octx = off.getContext('2d', { willReadFrequently: true });
            if (!octx) throw new Error('no 2d context for the probe');
            let running = true;
            const sample = () => {
                octx.clearRect(0, 0, 32, 32);
                octx.drawImage(host, 0, 0, 32, 32);
                const data = octx.getImageData(0, 0, 32, 32).data;
                let sum = 0;
                let sumSq = 0;
                const n = 32 * 32;
                for (let i = 0; i < n; i += 1) {
                    const o = i * 4;
                    const lum =
                        0.299 * data[o] +
                        0.587 * data[o + 1] +
                        0.114 * data[o + 2];
                    sum += lum;
                    sumSq += lum * lum;
                }
                const mean = sum / n;
                out.push(Math.sqrt(Math.max(0, sumSq / n - mean * mean)));
            };
            const tick = () => {
                if (!running) return;
                setTimeout(() => {
                    if (running) sample();
                }, 0);
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            w.__spreadStop = () => {
                running = false;
            };
        });
    }

    async function stopBlankWatch(page: Page): Promise<number[]> {
        return page.evaluate(() => {
            const w = window as unknown as {
                __spread?: number[];
                __spreadStop?: () => void;
            };
            w.__spreadStop?.();
            return w.__spread ?? [];
        }) as Promise<number[]>;
    }

    test('the canvas keeps its picture through every frame of a panel slide', async ({
        page,
    }) => {
        await openApp(page, TILED_APP);
        const before = await reader(page);

        await startBlankWatch(page);
        await toolbarButton(page, 'Toggle Information').click();
        await expect
            .poll(() => areaWidth(page), { timeout: 20_000 })
            .toBeLessThan(before.area - 100);
        // Past the end of the slide, so the trace covers every resized frame.
        await page.waitForTimeout(600);
        const spreads = await stopBlankWatch(page);

        // Anti-vacuity twice over: an empty trace asserts nothing, and a fixture
        // whose picture has no structure would read as blank throughout.
        expect(spreads.length).toBeGreaterThan(10);
        expect(spreads[0]).toBeGreaterThan(5);

        // An absolute floor rather than a fraction of the opening frame: the
        // slide legitimately changes how much of the grid is on screen, so the
        // spread moves a lot without anything being wrong. What cannot happen
        // is a UNIFORM surface, which is the cleared canvas composited before
        // anything repainted it — measured at exactly 0 when this regressed,
        // against 19+ for the quietest genuinely painted frame.
        const blanked = spreads.filter((spread) => spread < 2);
        expect(blanked).toEqual([]);
    });

    test('a canvas-anchored point stays under the reader’s finger across a chrome change', async ({
        page,
    }) => {
        await openApp(page);
        const home = await reader(page);

        await zoomAndPan(page);
        const before = await reader(page);
        // Anti-vacuity, and this case needs it more than most: at the HOME view
        // the anchor IS the canvas centre, which a refit also parks at the
        // surface centre, so every assertion below would hold under the rule
        // this case exists to reject.
        expect(before.view.scale).toBeGreaterThan(home.view.scale * 2);

        // What a plugin author's overlay is pinned to: the canvas coordinate
        // the reader has in the middle of the surface. `screenToCanvas` and
        // `canvasToScreen` share `.viewer-area`'s origin, so the middle of the
        // surface is (width/2, height/2) in both, before and after.
        const height = await areaHeight(page);
        const anchor = await screenToCanvas(page, {
            x: before.area / 2,
            y: height / 2,
        });
        expect(anchor).not.toBeNull();

        await toggleInformation(page, true, before.area);
        const after = await reader(page);
        const projected = await canvasToScreen(page, anchor!);
        expect(projected).not.toBeNull();

        // The reader's ink has not moved: the point they were looking at is
        // still in the middle of the surface they are left with. A refit would
        // put the CANVAS centre there instead and carry the overlay with it,
        // which is a change nobody made.
        expect(projected!.x).toBeCloseTo(after.area / 2, 0);
        expect(projected!.y).toBeCloseTo(height / 2, 0);
        // And the round trip is the identity, so the agreement above is between
        // the reader's view and the helpers rather than inside one of them.
        const roundTripped = await screenToCanvas(page, projected!);
        expect(roundTripped!.x).toBeCloseTo(anchor!.x, 3);
        expect(roundTripped!.y).toBeCloseTo(anchor!.y, 3);
    });

    test('a claimed time-based-media canvas keeps its transport put when a panel docks', async ({
        page,
    }) => {
        // The AV path is slow enough that the describe below buys itself 120s
        // for the same reason: the plugin, its media, and the transport all have
        // to arrive before the interaction starts.
        test.slow();
        await openApp(page, AV_APP);
        await page
            .locator(TRANSPORT)
            .waitFor({ state: 'visible', timeout: 30_000 });
        const home = await reader(page);

        await zoomAndPan(page);
        const before = await reader(page);
        // Anti-vacuity. This canvas is 320x180 with no pyramid, so its zoom
        // ceiling is far tighter than the image manifests': six wheel steps
        // reaching the ceiling instead of a chosen view would leave a reader at
        // the fit, where a refit and the compensation agree.
        expect(before.view.scale).toBeGreaterThan(home.view.scale * 2);
        const playBefore = await settledBox(page, TRANSPORT_PLAY);

        await toggleInformation(page, true, before.area);
        const after = await reader(page);
        const playAfter = await settledBox(page, TRANSPORT_PLAY);

        // The video stage is painted on the canvas, so the reader's view IS
        // where the picture went: compensated for the width the panel took,
        // centre untouched, and not thrown back to the fit.
        expect(after.area / after.view.scale).toBeCloseTo(
            before.area / before.view.scale,
            0,
        );
        expect(after.view.centre.x).toBeCloseTo(before.view.centre.x, 0);
        expect(after.view.centre.y).toBeCloseTo(before.view.centre.y, 0);

        // PLAY is the transport's leftmost control and the row is anchored to
        // the start of the control bar, so the panel narrowing the bar must not
        // slide it: a reader with a finger on the play button still has one.
        expect(playAfter.x).toBeCloseTo(playBefore.x, 0);
        // A headless browser refuses audible script-initiated playback, so mute
        // before asking for sound — a refusal would be state, not an error.
        await page.locator(TRANSPORT_MUTE).click({ timeout: 20_000 });
        await page.locator(TRANSPORT_PLAY).click({ timeout: 20_000 });
        await expect
            .poll(
                () =>
                    page
                        .locator(AV_MEDIA)
                        .evaluate((el) => (el as HTMLMediaElement).paused),
                { timeout: 20_000 },
            )
            .toBe(false);
    });
});

/**
 * The Contract line this whole ticket exists for, in the configuration that
 * produced the original report: a claimed AV canvas with the plugin's panel
 * docked beside it, and playback controls a reader has to be able to reach.
 *
 * Measured at `6d1dec59`, when the transport was anchored to the canvas rect,
 * its box was 799px wide inside a 479px `.plugin-overlay-layer`, so PLAY — the
 * row's LEFTMOST control — sat at x 177, behind the panel column and clipped
 * out of the hit test by ticket 12's `overflow: hidden`. MUTE, further right,
 * clicked fine throughout, which is why a spec that exercised only the
 * right-hand controls never caught it.
 *
 * The transport is in the control bar now and cannot be clipped by a docked
 * column, but the assertion is kept and re-pointed at it: the reason it was
 * written — the leftmost playback control is inside the visible surface and
 * takes a real click with the panel docked — is a fact about the viewer, not
 * about where the chrome happened to live.
 *
 * Both artifacts are the BUILT ones (`pnpm build:all`), as in `av-transport`.
 */
test.describe('docked chrome — AV playback controls stay operable', () => {
    test.describe.configure({ timeout: 120_000 });

    const AV_FIXTURE = '/e2e/av-plugin.html';

    test('the transport’s leftmost control is inside the surface and clickable with the panel docked', async ({
        page,
    }) => {
        await serveAvPluginDist(page);
        await page.goto(
            `${AV_FIXTURE}?manifest=${encodeURIComponent(AV_MANIFESTS.video)}`,
            { waitUntil: 'domcontentloaded' },
        );
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });
        await page
            .locator(TRANSPORT)
            .waitFor({ state: 'visible', timeout: 30_000 });

        // The panel is docked from load in this fixture, so what settles here
        // is the re-fit it caused.
        const box = await settled(page, async (p) => ({
            surface: await p.locator(SURFACE).boundingBox(),
            transport: await p.locator(TRANSPORT).boundingBox(),
        }));
        expect(box.surface).not.toBeNull();
        expect(box.transport).not.toBeNull();

        // Half of the Contract line: INSIDE the visible surface. This is the
        // 799-in-479 assertion, stated as the relation rather than as the two
        // numbers, which depend on the fixture's size.
        expect(box.transport!.x).toBeGreaterThanOrEqual(box.surface!.x - 1);
        expect(box.transport!.x + box.transport!.width).toBeLessThanOrEqual(
            box.surface!.x + box.surface!.width + 1,
        );

        // A headless browser refuses audible script-initiated playback, so mute
        // before asking for sound — a refusal would be state, not an error.
        await page.locator(TRANSPORT_MUTE).click({ timeout: 20_000 });

        // The other half: CLICKABLE. No `force` — a control clipped away or
        // pushed off the surface fails here rather than passing silently — and
        // the media element is read back, so a click that landed on nothing
        // cannot pass either.
        await page.locator(TRANSPORT_PLAY).click({ timeout: 20_000 });
        await expect
            .poll(
                () =>
                    page
                        .locator(AV_MEDIA)
                        .evaluate((el) => (el as HTMLMediaElement).paused),
                { timeout: 20_000 },
            )
            .toBe(false);
    });
});
