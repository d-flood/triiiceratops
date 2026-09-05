/**
 * IIIF Cookbook recipe 0346, "Annotating in Multiple Languages", in a real
 * browser.
 *
 * The recipe's comment body is a `Choice` of two `TextualBody` items differing
 * only in `language` and `value`, and what is asserted is that the viewer picks
 * ONE of them — the reader's — and re-picks it when the reader's language
 * changes.
 *
 * Driven on the recipe's own published manifest, served from the vendored copy
 * at its canonical `iiif.io` id, with `iiif.io`'s reference image service
 * standing in as the dev server's own fake one. Nothing here reaches the
 * network.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { E2E_ORIGIN } from './helpers/origin';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
});

const RECIPE = '0346-multilingual-annotation-body';
const MANIFEST_URL = `https://iiif.io/api/cookbook/recipe/${RECIPE}/manifest.json`;
const FIXTURE = join(
    import.meta.dirname,
    `../src/lib/test/fixtures/manifests/cookbook/${RECIPE}.json`,
);

const SURFACE = '[data-testid="canvas-renderer-surface"]';
const ROW = `[data-annotation-row="https://iiif.io/api/cookbook/recipe/${RECIPE}/annotation/p0001-comment"]`;

const ENGLISH = 'Koto with a cover being carried';
const JAPANESE = '袋に収められた琴';

/** The recipe, with the annotation panel open in one locale. */
async function openRecipe(page: Page, locale: string): Promise<void> {
    await page.route(`**${MANIFEST_URL}`, (route) =>
        route.fulfill({
            contentType: 'application/json',
            body: readFileSync(FIXTURE),
        }),
    );

    // `iiif.io`'s reference Image API service becomes the dev server's own fake
    // one, so the canvas paints through the real tile pipeline.
    await page.route('https://iiif.io/api/image/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const rest = path.replace('/api/image/3.0/example/reference/', '');
        const response = await route.fetch({
            url: `${E2E_ORIGIN}/iiif-fixture/${rest}`,
        });
        return route.fulfill({ response });
    });

    const config = encodeURIComponent(
        JSON.stringify({ locale, annotations: { open: true } }),
    );
    await page.goto(
        `/e2e/harness.html?manifest=${encodeURIComponent(MANIFEST_URL)}&config=${config}`,
        { waitUntil: 'domcontentloaded' },
    );
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator(ROW).waitFor({ state: 'visible', timeout: 60_000 });
}

/** Switch the viewer's locale the way a host does: through `config.locale`. */
async function setLocale(page: Page, locale: string): Promise<void> {
    await page.evaluate((next) => {
        const viewer = document.querySelector('triiiceratops-viewer')!;
        const config = JSON.parse(viewer.getAttribute('config') ?? '{}');
        viewer.setAttribute(
            'config',
            JSON.stringify({ ...config, locale: next }),
        );
    }, locale);
}

test('renders the English body under an English locale', async ({ page }) => {
    await openRecipe(page, 'en');

    await expect(page.locator(ROW)).toContainText(ENGLISH);
    await expect(page.locator(ROW)).not.toContainText(JAPANESE);
});

test('renders the Japanese body under a Japanese locale', async ({ page }) => {
    await openRecipe(page, 'ja');

    await expect(page.locator(ROW)).toContainText(JAPANESE);
    await expect(page.locator(ROW)).not.toContainText(ENGLISH);
});

test('re-picks the body when the reader switches language', async ({
    page,
}) => {
    await openRecipe(page, 'en');
    await expect(page.locator(ROW)).toContainText(ENGLISH);

    await setLocale(page, 'ja');
    await expect(page.locator(ROW)).toContainText(JAPANESE);
    await expect(page.locator(ROW)).not.toContainText(ENGLISH);

    await setLocale(page, 'en');
    await expect(page.locator(ROW)).toContainText(ENGLISH);
});

test('falls back to the first item for a language the recipe does not carry', async ({
    page,
}) => {
    await openRecipe(page, 'de');

    // English is the Choice's first item, and item order is how the manifest's
    // author states a preference.
    await expect(page.locator(ROW)).toContainText(ENGLISH);
});
