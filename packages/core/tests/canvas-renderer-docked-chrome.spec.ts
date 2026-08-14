/**
 * **Docked chrome and the fit**: what happens to the projection when CORE takes
 * part of the viewer surface for a panel column.
 *
 * A resize is not one event. A window resize preserves the reader's scale —
 * they chose that view and nothing was taken from them — while a docked panel
 * removes ~320px of the very surface the current projection was fitted to. A
 * projection that keeps its size across that overhangs `.viewer-area`, and the
 * overlay layer's `overflow: hidden` clips the overhang out of both the picture
 * and the hit test, so canvas-anchored chrome sitting there is invisible and
 * unclickable. These tests hold the two cases apart on BOTH axes — a bottom-docked
 * gallery takes height the same way a panel column takes width — and check that
 * canvas-anchored chrome over a viewer with a panel docked is still operable.
 *
 * Browser-only by construction: the whole claim is about laid-out column widths
 * and hit testing.
 */

import { expect, test, type Page } from '@playwright/test';

import { AV_MANIFESTS } from './helpers/avMedia';
import { serveAvPluginDist } from './helpers/avPluginDist';
import { getView } from './helpers/numberedGrid';
import { settled } from './helpers/settle';

const FIXTURE = '/e2e/canvas-renderer-wc.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const VIEWER_AREA = '.viewer-area';

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

test('docking a panel re-fits the canvas into the narrowed viewer area', async ({
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

test('docking a gallery to the BOTTOM re-fits the canvas into the shortened viewer area', async ({
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
 * The Contract line this whole ticket exists for, in the configuration that
 * produced the original report: a claimed AV canvas with the plugin's panel
 * docked beside it, and the transport anchored to the canvas rect.
 *
 * Measured at `6d1dec59` the anchor was 799px wide inside a 479px
 * `.plugin-overlay-layer`, so PLAY — the row's LEFTMOST control — sat at x 177,
 * behind the panel column and clipped out of the hit test by ticket 12's
 * `overflow: hidden`. MUTE, further right, clicked fine throughout, which is
 * why a spec that exercised only the right-hand controls never caught it.
 *
 * Both artifacts are the BUILT ones (`pnpm build:all`), as in `av-transport`.
 */
test.describe('docked chrome — anchored AV chrome stays operable', () => {
    test.describe.configure({ timeout: 120_000 });

    const AV_FIXTURE = '/e2e/av-plugin.html';
    const OVERLAY_LAYER = '.plugin-overlay-layer';
    const ANCHOR = '[data-testid="av-transport-anchor"]';
    const PLAY = '[data-testid="av-play"]';
    const MUTE = '[data-testid="av-mute"]';
    const MEDIA = '[data-testid="av-media"]';

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
            .locator(ANCHOR)
            .waitFor({ state: 'visible', timeout: 30_000 });

        // The panel is docked from load in this fixture, so what settles here
        // is the re-fit it caused.
        const box = await settled(page, async (p) => ({
            layer: await p.locator(OVERLAY_LAYER).boundingBox(),
            anchor: await p.locator(ANCHOR).boundingBox(),
        }));
        expect(box.layer).not.toBeNull();
        expect(box.anchor).not.toBeNull();

        // Half of the Contract line: INSIDE the visible surface. This is the
        // 799-in-479 assertion, stated as the relation rather than as the two
        // numbers, which depend on the fixture's size.
        expect(box.anchor!.x).toBeGreaterThanOrEqual(box.layer!.x - 1);
        expect(box.anchor!.x + box.anchor!.width).toBeLessThanOrEqual(
            box.layer!.x + box.layer!.width + 1,
        );

        // A headless browser refuses audible script-initiated playback, so mute
        // before asking for sound — a refusal would be state, not an error.
        await page.locator(MUTE).click({ timeout: 20_000 });

        // The other half: CLICKABLE. No `force` — a control clipped away or
        // pushed off the surface fails here rather than passing silently — and
        // the media element is read back, so a click that landed on nothing
        // cannot pass either.
        await page.locator(PLAY).click({ timeout: 20_000 });
        await expect
            .poll(
                () =>
                    page
                        .locator(MEDIA)
                        .evaluate((el) => (el as HTMLMediaElement).paused),
                { timeout: 20_000 },
            )
            .toBe(false);
    });
});
