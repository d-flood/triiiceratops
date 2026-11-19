import { expect, test, type Page } from '@playwright/test';

import { FEATURES } from '../src/lib/features';

const MANIFEST = '/material/mixed/manifest.json';
const FEATURE = String(
    FEATURES.findIndex((feature) => feature.writesViewTo) + 1,
);

function readout(page: Page) {
    return page.locator('.featstage__kept code');
}

async function open(page: Page, view = '') {
    await page.goto(`/features/?feature=${FEATURE}${view}`);
    await expect(readout(page)).toHaveText(/^[a-z]/, { timeout: 30_000 });
}

test('writes the settled view to its own parameter and restores it on reload', async ({
    page,
}) => {
    await open(page);
    await expect(readout(page)).toHaveText('audubon');

    await page
        .locator('.featstage__viewer')
        .getByRole('button', { name: 'Zoom In' })
        .click();
    await expect(readout(page)).toHaveText(/^audubon#xywh=/);
    await expect(page).toHaveURL(/[?&]view=/);
    const zoomed = await readout(page).textContent();

    const url = new URL(page.url());
    expect(url.searchParams.get('feature')).toBe(FEATURE);
    expect(url.searchParams.has('iiif-content')).toBe(false);

    await page.getByRole('button', { name: 'Reload page' }).click();
    await expect(readout(page)).toHaveText(zoomed ?? '', { timeout: 30_000 });
});

test('opens a written playhead over the feature’s own starting canvas', async ({
    page,
    baseURL,
}) => {
    const state = Buffer.from(
        JSON.stringify({
            id: 'https://example.org/content-state/1',
            type: 'Annotation',
            motivation: 'contentState',
            target: {
                id: `${baseURL}/material/mixed/canvas/lost-chord#t=30`,
                type: 'Canvas',
                partOf: [{ id: `${baseURL}${MANIFEST}`, type: 'Manifest' }],
            },
        }),
    ).toString('base64url');

    await open(page, `&view=${state}`);
    await expect(readout(page)).toHaveText('lost-chord#t=30.0', {
        timeout: 30_000,
    });
});
