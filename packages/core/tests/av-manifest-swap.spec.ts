/**
 * Swapping the manifest while a transport control holds focus. Chromium fires
 * `focusout` as it removes the focused button, from inside Svelte's teardown,
 * so only a real browser exercises it.
 *
 * Core loads from source on the bare harness; the AV plugin from its built
 * dist, so `pnpm build:all` must have run.
 */

import { expect, test } from '@playwright/test';

import { AV_MANIFESTS } from './helpers/avMedia';

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const PLAY = '[data-testid="transport-play"]';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const IMAGE_MANIFEST = '/demo-manifests/e2e/manifest.json';

test('swapping the manifest while a transport control holds focus throws nothing', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(
        `/e2e/harness.html?plugins=av&manifest=${encodeURIComponent(AV_MANIFESTS.audio)}`,
    );
    const play = page.locator(PLAY);
    await play.click();
    await play.click();
    await expect(play).toBeFocused();

    await page.evaluate((manifest) => {
        document
            .querySelector('triiiceratops-viewer')!
            .setAttribute('manifest-id', manifest);
    }, IMAGE_MANIFEST);

    await expect(page.locator(SURFACE)).toBeVisible();
    await expect(play).toHaveCount(0);
    expect(errors).toEqual([]);
});
