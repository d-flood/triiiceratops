/**
 * IIIF Cookbook recipe 0258, "Tagging with an External Resource", in a real
 * browser.
 *
 * The recipe tags a region of the Göttingen photograph with a Wikidata record:
 * one body is a `SpecificResource` carrying the record's URI and no text at
 * all, and what is asserted is that the reader gets a followable link rather
 * than the `Annotation` placeholder a body with neither text nor a usable
 * identity falls back to.
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

const RECIPE = '0258-tagging-external-resource';
const MANIFEST_URL = `https://iiif.io/api/cookbook/recipe/${RECIPE}/manifest.json`;
const FIXTURE = join(
    import.meta.dirname,
    `../src/lib/test/fixtures/manifests/cookbook/${RECIPE}.json`,
);

const SURFACE = '[data-testid="canvas-renderer-surface"]';
const ROW = `[data-annotation-row="https://iiif.io/api/cookbook/recipe/${RECIPE}/annotation/anno/p0002-wikidata"]`;

const WIKIDATA = 'http://www.wikidata.org/entity/Q18624915';
const TAG_TEXT = 'Gänseliesel-Brunnen';

/**
 * The recipe, with the annotation panel open.
 *
 * `patchBody` rewrites the annotation's external body before the manifest is
 * served, which is how the hostile-URI case is driven: the Cookbook publishes
 * only the well-behaved manifest, and a fixture on disk asserting that a
 * `javascript:` URI is refused would be a second manifest claiming to be this
 * recipe.
 */
async function openRecipe(
    page: Page,
    patchBody?: (body: Record<string, unknown>) => void,
): Promise<void> {
    await page.route(`**${MANIFEST_URL}`, (route) => {
        const manifest = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        if (patchBody) {
            patchBody(manifest.items[0].annotations[0].items[0].body[0]);
        }
        return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(manifest),
        });
    });

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
        JSON.stringify({ annotations: { open: true } }),
    );
    await page.goto(
        `/e2e/harness.html?manifest=${encodeURIComponent(MANIFEST_URL)}&config=${config}`,
        { waitUntil: 'domcontentloaded' },
    );
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator(ROW).waitFor({ state: 'visible', timeout: 60_000 });
}

test('renders the external body as a followable link', async ({ page }) => {
    await openRecipe(page);

    const link = page.locator(`${ROW} a`);
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', WIKIDATA);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    // The recipe's external body carries no `label`, so the URI is the only
    // text there is to show for it.
    await expect(link).toContainText(WIKIDATA);
    await expect(page.locator(ROW)).not.toContainText('Annotation');
});

test('shows the tag’s own text alongside the link', async ({ page }) => {
    await openRecipe(page);

    // 0258's second body is the same plain-text tag recipe 0021 publishes, and
    // it belongs in the row the link is in rather than a section of its own.
    await expect(page.locator(ROW)).toContainText(TAG_TEXT);
});

test('refuses a `javascript:` body URI', async ({ page }) => {
    await openRecipe(page, (body) => {
        body.source = 'javascript:alert(1)';
    });

    await expect(page.locator(`${ROW} a`)).toHaveCount(0);
    await expect(page.locator(ROW)).toContainText(TAG_TEXT);
});
