/**
 * What `/viewer/` shows between first paint and first canvas.
 *
 * A reader arriving from a Cookbook link waits through a module load and a
 * dereference before there is anything to see, and every distinct thing shown in
 * that window reads as a flash. There is one: the same sentence on the same
 * ground, handed from the prerendered shell to the viewer's own pane.
 *
 * The failure this guards is specific — the fallback form, whose job is to ask
 * for a manifest URL, appearing over the manifest the link already named.
 */

import { expect, test, type Page } from '@playwright/test';

import { HOSTED_VIEWER_PATH as VIEWER_PATH } from '../src/lib/site';
import { imageManifest } from './fixtures/manifests';
import { ORIGIN } from './helpers/origin';

const MANIFEST = `${ORIGIN}/test-manifests/slow.json`;
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const FALLBACK = '[data-testid="content-state-input"]';
const WAITING = '[data-testid="content-waiting"]';

/** Hold the manifest, so the window this spec is about is wide enough to watch. */
async function serveSlowly(page: Page, delay = 1500): Promise<void> {
    await page.route(MANIFEST, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(imageManifest(MANIFEST)),
        });
    });
}

const url = `${VIEWER_PATH}?iiif-content=${encodeURIComponent(MANIFEST)}`;

test('the fallback form never appears while the link is resolving', async ({
    page,
}) => {
    await serveSlowly(page);
    await page.goto(url, { waitUntil: 'commit' });

    let sawFallback = false;
    for (let i = 0; i < 200; i += 1) {
        const [fallback, canvas] = await Promise.all([
            page.locator(FALLBACK).count(),
            page.locator(SURFACE).count(),
        ]);
        if (fallback) sawFallback = true;
        if (canvas) break;
        await page.waitForTimeout(25);
    }

    expect(sawFallback).toBe(false);
    await expect(page.locator(SURFACE)).toBeVisible();
});

test('something covers the viewer for the whole wait', async ({ page }) => {
    await serveSlowly(page);
    await page.goto(url, { waitUntil: 'commit' });

    // Mid-wait: the manifest is still held, so this is the window itself.
    await expect(page.locator(WAITING)).toBeVisible();
    await expect(page.locator(SURFACE)).toHaveCount(0);

    // And it gets out of the way once there is something to see.
    await expect(page.locator(SURFACE)).toBeVisible();
    await expect(page.locator(WAITING)).toHaveCount(0);
});

test('the waiting screen covers the viewer whole, chrome included', async ({
    page,
}) => {
    await serveSlowly(page, 3000);
    await page.goto(url, { waitUntil: 'commit' });
    await expect(page.locator(WAITING)).toBeVisible();

    // The control bar lifts itself within the viewer; a pane standing in for the
    // view has to come out above it, or the bar strobes over the loading screen.
    const bar = page.locator('.control-bar').first();
    await expect(bar).toBeAttached();
    const box = (await bar.boundingBox())!;
    const painted = await page.evaluate(
        ([x, y]) =>
            document.elementFromPoint(x, y)?.getAttribute('data-testid'),
        [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(painted).toBe('content-waiting');
});

test('a bare /viewer/ still offers the form at once', async ({ page }) => {
    // Nothing was asked for, so there is nothing to wait for: the form is the
    // page, and suppressing it during a wait must not suppress it here.
    await page.goto(VIEWER_PATH);

    await expect(page.locator(FALLBACK)).toBeVisible();
    await expect(page.locator(WAITING)).toHaveCount(0);
});
