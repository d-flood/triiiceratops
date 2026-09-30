import { expect, test, type Page } from '@playwright/test';

import {
    getStats,
    GRID_FEATURES,
    lastFrameDrawCount,
    nextPaint,
    openRendererManifest,
    setSkipCoveredTiles,
    setView,
    TILED_MANIFEST,
    TILED_V2_MANIFEST,
} from './helpers/numberedGrid';

const SURFACE = '[data-testid="canvas-renderer-surface"]';

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'The tiled renderer slice is Chromium-only.',
);

async function surfacePixels(page: Page): Promise<string> {
    return page.locator(SURFACE).evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const { data } = canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height);
        let hash = 0x811c9dc5;
        for (let index = 0; index < data.length; index += 1) {
            hash = Math.imul(hash ^ data[index], 0x01000193);
        }
        return `${canvas.width}x${canvas.height}:${hash >>> 0}`;
    });
}

// Network idle is not enough: tiles are still decoding after their fetch ends.
async function settle(page: Page): Promise<void> {
    let previous = '';
    await expect
        .poll(
            async () => {
                await page.waitForTimeout(200);
                await nextPaint(page);
                const { residentTileCount } = await getStats(page);
                const current = `${await surfacePixels(page)}/${residentTileCount}`;
                const same = current === previous;
                previous = current;
                return same;
            },
            { timeout: 20_000 },
        )
        .toBe(true);
}

async function paintBothWays(page: Page, manifest: string, scale: number) {
    await openRendererManifest(page, manifest);
    await setView(page, { centre: GRID_FEATURES.bravo, scale });
    await settle(page);
    const on = {
        pixels: await surfacePixels(page),
        draws: await lastFrameDrawCount(page),
    };
    await setSkipCoveredTiles(page, false);
    const off = {
        pixels: await surfacePixels(page),
        draws: await lastFrameDrawCount(page),
    };
    return { on, off };
}

for (const deviceScaleFactor of [1, 2]) {
    test.describe(`at ${deviceScaleFactor}x`, () => {
        test.use({ deviceScaleFactor });

        for (const scale of [1.13, 2.37]) {
            test(`a stable view at scale ${scale} paints the same pixels with fewer draws`, async ({
                page,
            }) => {
                // The v2 service is asked for `jpg`, the opaque format.
                const { on, off } = await paintBothWays(
                    page,
                    TILED_V2_MANIFEST,
                    scale,
                );

                expect(on.draws).toBeGreaterThan(0);
                expect(on.draws).toBeLessThan(off.draws);
                expect(on.pixels).toBe(off.pixels);
            });
        }

        test('never skips coarse tiles under a format that may carry alpha', async ({
            page,
        }) => {
            // The level 2 service prefers `png`.
            const { on, off } = await paintBothWays(page, TILED_MANIFEST, 1.6);

            expect(on.draws).toBeGreaterThan(0);
            expect(on.draws).toBe(off.draws);
            expect(on.pixels).toBe(off.pixels);
        });
    });
}
