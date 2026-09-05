/**
 * The **unsupported presentation**, in a real browser.
 *
 * `renderer/unsupportedPresentation.test.ts` proves what the planner DECIDES for
 * a canvas core cannot render: no request of any kind, a layout rect kept. What
 * only a browser can show is that the decision reaches the reader — a labelled
 * box over the canvas's rect, a glyph rather than a broken picture in the
 * thumbnail strip, and a canvas that is still there to navigate to.
 *
 * ## Why the manifests are intercepted rather than fetched
 *
 * The two canvases the epic names are IIIF Cookbook recipes, and this suite
 * runs with no network. Their manifests are vendored in the corpus
 * (`src/lib/test/fixtures/manifests/av/`) and served here from disk through
 * `page.route`, at their own upstream ids so the manifest reads exactly as
 * published. Their media URLs are left pointing at `fixtures.iiif.io`, which is
 * the point: **a request to that host is a test failure**, and the assertion
 * below is that none is ever made. Fetching the video would be visible as a
 * network request whether the fetch came from an `<img>`, a tile, or a
 * thumbnail.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const AV_DIR = join(
    import.meta.dirname,
    '../src/lib/test/fixtures/manifests/av',
);

const SURFACE = '[data-testid="canvas-renderer-surface"]';
const PLACEHOLDER = '[data-testid="canvas-unsupported-placeholder"]';
const LABEL = '[data-testid="canvas-unsupported-label"]';
const ERROR_PLACEHOLDER = '[data-testid="canvas-error-placeholder"]';
const AV_GLYPH = '[data-testid="thumb-av-glyph"]';

/** The media hosts these recipes paint from. Nothing may ever ask for them. */
const MEDIA_HOST = /fixtures\.iiif\.io|dlib\.indiana\.edu/;

const RECIPES = {
    video: {
        file: '0003-mvm-video.json',
        url: 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
    },
    audio: {
        file: '0002-mvm-audio.json',
        url: 'https://iiif.io/api/cookbook/recipe/0002-mvm-audio/manifest.json',
    },
} as const;

/**
 * Open one vendored recipe, served from disk at its own id, with the thumbnail
 * strip docked open. Returns the list of every URL the page requested, which
 * keeps growing for as long as the test runs.
 */
async function openRecipe(
    page: Page,
    recipe: { file: string; url: string },
): Promise<string[]> {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));

    await page.route(recipe.url, (route) =>
        route.fulfill({
            contentType: 'application/json',
            body: readFileSync(join(AV_DIR, recipe.file), 'utf8'),
        }),
    );

    const config = encodeURIComponent(
        JSON.stringify({ gallery: { open: true, dockPosition: 'bottom' } }),
    );
    await page.goto(
        `/e2e/harness.html?manifest=${recipe.url}&config=${config}`,
        {
            waitUntil: 'domcontentloaded',
        },
    );
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });

    return requested;
}

for (const [name, recipe] of Object.entries(RECIPES)) {
    // Every title under here carries "unsupported", so the ticket's
    // `pnpm test:e2e -- -g "unsupported"` selects the whole suite rather than
    // the one test that happened to name it.
    test.describe(`the unsupported presentation — ${name} recipe, ${recipe.file}`, () => {
        test('is shown over its canvas', async ({ page }) => {
            await openRecipe(page, recipe);

            const placeholder = page.locator(PLACEHOLDER);
            await expect(placeholder).toHaveCount(1, { timeout: 30_000 });

            // Named for assistive technology, and visibly stated for everyone
            // else. The box is the whole viewport-sized canvas rect here, so
            // the label is well above the minimum that suppresses it.
            await expect(placeholder).toHaveAttribute('aria-label', /.+/);
            await expect(page.locator(LABEL)).toHaveCount(1);

            // NOT an error placeholder. No retry, no error chrome, nothing in
            // the negative cache — the viewer never asked for anything.
            await expect(page.locator(ERROR_PLACEHOLDER)).toHaveCount(0);
        });

        test('never requests the media, by any channel', async ({ page }) => {
            const requested = await openRecipe(page, recipe);
            await expect(page.locator(PLACEHOLDER)).toHaveCount(1, {
                timeout: 30_000,
            });

            // Give every deferred path — the view-stable gate, the thumbnail
            // ladder, a lazily-mounted strip — a chance to ask for something.
            await page.waitForTimeout(1_000);

            expect(requested.filter((url) => MEDIA_HOST.test(url))).toEqual([]);
        });

        test('appears in the thumbnail strip as a glyph, never as media', async ({
            page,
        }) => {
            await openRecipe(page, recipe);

            const glyph = page.locator(AV_GLYPH);
            await expect(glyph).toHaveCount(1, { timeout: 30_000 });

            // The old fallback put the painting body's own id into an
            // `<img src>`, which for these canvases is an MP3 or an MP4.
            const sources = await page
                .locator('img')
                .evaluateAll((images) =>
                    images.map((image) => (image as HTMLImageElement).src),
                );
            expect(
                sources.filter((src) => /\.mp4|\.mp3|\.m4a/.test(src)),
            ).toEqual([]);
        });

        test('stays navigable — the canvas is still in the viewer', async ({
            page,
        }) => {
            await openRecipe(page, recipe);
            await expect(page.locator(PLACEHOLDER)).toHaveCount(1, {
                timeout: 30_000,
            });

            // One canvas each, so "navigable" is that the strip offers it and
            // selecting it keeps the viewer on it rather than blanking. A
            // canvas dropped from layout would have no strip entry to click.
            const item = page.locator('.thumb-item').first();
            await expect(item).toBeVisible();
            await item.click();

            await expect(page.locator(SURFACE)).toBeVisible();
            await expect(page.locator(PLACEHOLDER)).toHaveCount(1);
        });
    });
}
