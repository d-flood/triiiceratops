/**
 * The bare viewer's courtesy to a reader arriving from the IIIF Cookbook: a
 * recipe whose feature lives in a panel opens with that panel already open.
 *
 * The recipe is recognised from the manifest URL, so these screens serve their
 * fixtures at the Cookbook's own URLs through `page.route` — the URL is the
 * whole of the trigger, and a fixture served anywhere else would not test it.
 */

import { expect, test, type Page } from '@playwright/test';

import { HOSTED_VIEWER_PATH as VIEWER_PATH } from '../src/lib/site';
import {
    annotatedManifest,
    collectionDocument,
    imageManifest,
    multilingualManifest,
    rangedManifest,
    timedAnnotationManifest,
} from './fixtures/manifests';

const SURFACE = '[data-testid="canvas-renderer-surface"]';
/*
 * The docked panel itself, not the stacked section inside it: core marks both
 * with the panel id, and only the outer one is the panel standing open.
 */
const COLLECTION_PANEL = '.tri-panel[data-panel-id="collection"]';
const STRUCTURES_PANEL = '.tri-panel[data-panel-id="structures"]';
/*
 * A plugin's panel, which core renders as the stack section itself — there is no
 * outer `.tri-panel` around it as there is for core's own.
 */
const AV_PANEL = '[data-panel-id="av:panel"]';
const INFORMATION_PANEL = '.tri-panel[data-panel-id="metadata"]';
const ANNOTATION_PANEL = '.tri-panel[data-panel-id="annotations"]';

function recipeUrl(id: string): string {
    return `https://iiif.io/api/cookbook/recipe/${id}/manifest.json`;
}

/**
 * The unified bar's collapse toggle, whose `aria-expanded` is the toolbar's own
 * account of whether it stands open.
 */
function toolbarToggle(page: Page) {
    return page.locator('button.inline-toggle');
}

/**
 * The same recipe as a local copy of the Cookbook serves it: its own host, and
 * no `/api/cookbook` prefix. Someone writing a recipe reads it from here.
 */
function localRecipeUrl(id: string): string {
    return `http://localhost:4000/recipe/${id}/manifest.json`;
}

/** Serve `body` at `url` and open `/viewer/` on a content state naming it. */
async function openRecipe(
    page: Page,
    id: string,
    body: (url: string) => unknown,
    url = recipeUrl(id),
): Promise<void> {
    await page.route(url, (route) =>
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(body(url)),
        }),
    );
    await page.goto(`${VIEWER_PATH}?iiif-content=${encodeURIComponent(url)}`);
    await expect(page.locator(SURFACE)).toBeVisible();
}

test('a descriptive-property recipe opens with the information panel', async ({
    page,
}) => {
    await openRecipe(page, '0006-text-language', multilingualManifest);

    await expect(page.locator(INFORMATION_PANEL)).toBeVisible();
    await expect(page.locator(ANNOTATION_PANEL)).toHaveCount(0);
});

test('an annotation recipe opens with the annotation panel', async ({
    page,
}) => {
    await openRecipe(page, '0266-full-canvas-annotation', annotatedManifest);

    await expect(page.locator(ANNOTATION_PANEL)).toBeVisible();
    await expect(
        page.getByText('A comment on the whole canvas.'),
    ).toBeVisible();
    await expect(page.locator(INFORMATION_PANEL)).toHaveCount(0);
});

test('a recipe with nothing to point at opens with no panel', async ({
    page,
}) => {
    await openRecipe(page, '0001-mvm-image', imageManifest);

    await expect(page.locator(INFORMATION_PANEL)).toHaveCount(0);
    await expect(page.locator(ANNOTATION_PANEL)).toHaveCount(0);
});

test('a recipe read from a local copy of the Cookbook opens the same panel', async ({
    page,
}) => {
    await openRecipe(
        page,
        '0006-text-language',
        multilingualManifest,
        localRecipeUrl('0006-text-language'),
    );

    await expect(page.locator(INFORMATION_PANEL)).toBeVisible();
});

test('a recipe opens with the toolbar expanded', async ({ page }) => {
    // 0006's point is its languages, and the only way to another one is the
    // toolbar's locale picker. A closed bar hides the whole recipe.
    await openRecipe(page, '0006-text-language', multilingualManifest);

    await expect(toolbarToggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(
        page.getByRole('button', { name: 'Language', exact: true }),
    ).toBeVisible();
});

test('a recipe whose feature is a toolbar control opens with no panel', async ({
    page,
}) => {
    await openRecipe(page, '0027-alternative-page-order', imageManifest);

    await expect(toolbarToggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(INFORMATION_PANEL)).toHaveCount(0);
    await expect(page.locator(ANNOTATION_PANEL)).toHaveCount(0);
});

test('a manifest that is not a recipe leaves the toolbar shut', async ({
    page,
}) => {
    await openRecipe(page, '0001-mvm-image', imageManifest);

    await expect(toolbarToggle(page)).toHaveAttribute('aria-expanded', 'false');
});

test('a collection recipe opens with the collection panel', async ({
    page,
}) => {
    // The recipe's own document is a Collection, and it is served as
    // `collection.json` rather than `manifest.json` — the recipe directory is
    // what identifies it, not the file in it.
    const url = 'http://localhost:4000/recipe/0032-collection/collection.json';
    await page.route(
        `${url.slice(0, url.lastIndexOf('/'))}/manifest-0*`,
        (route) =>
            route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify(imageManifest(route.request().url())),
            }),
    );
    await openRecipe(page, '0032-collection', collectionDocument, url);

    await expect(page.locator(COLLECTION_PANEL)).toBeVisible();
    await expect(toolbarToggle(page)).toHaveAttribute('aria-expanded', 'true');
});

test('a table-of-contents recipe opens with the structures panel', async ({
    page,
}) => {
    await openRecipe(page, '0024-book-4-toc', rangedManifest);

    await expect(page.locator(STRUCTURES_PANEL)).toBeVisible();
    // The ranges, not just the frame around them: a panel opened over an empty
    // tree is worse than the closed one it replaced.
    await expect(
        page.locator(STRUCTURES_PANEL).getByText('Chapter 1'),
    ).toBeVisible();
    await expect(toolbarToggle(page)).toHaveAttribute('aria-expanded', 'true');
});

test('a timed-annotation recipe opens the AV panel, not the annotation one', async ({
    page,
}) => {
    /*
     * The media is left unfulfilled on purpose. What decides this is the canvas
     * carrying a Sound body and a timed annotation, both of which are in the
     * manifest; whether the bytes arrive is the stage's problem, not the panel's.
     */
    await openRecipe(page, '0103-poetry-reading-annotations', (url) =>
        timedAnnotationManifest(url, `${url}/tone.wav`),
    );

    await expect(page.locator(AV_PANEL)).toBeVisible();
    await expect(page.locator(ANNOTATION_PANEL)).toHaveCount(0);
    await expect(toolbarToggle(page)).toHaveAttribute('aria-expanded', 'true');
});
