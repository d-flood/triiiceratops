import { test, expect } from '@playwright/test';

test.describe('Triiiceratops Viewer', () => {
    test('smoke test: loads viewer and canvas', async ({ page }) => {
        // Navigate to the app
        await page.goto('/');

        // Verify basic page structure
        await expect(page.locator('#triiiceratops-viewer')).toBeVisible();

        // Wait for manifest loading to complete (spinners should disappear)
        const spinner = page.locator('.loading-spinner');
        await expect(spinner).not.toBeVisible({ timeout: 20000 });

        // Check for error state
        const errorMsg = page.locator('.text-error');
        if (await errorMsg.isVisible()) {
            const text = await errorMsg.textContent();
            console.error(`Viewer reported error: ${text}`);
            throw new Error(`Viewer failed to load: ${text}`);
        }

        // Now check for OSD viewer
        const viewer = page.locator('.openseadragon-container');
        await expect(viewer).toBeVisible({ timeout: 10000 });

        // Ensure the OSD host container is not left hidden by reveal timing.
        const osdBackground = page.locator('.osd-background').first();
        await expect(osdBackground).toBeVisible({ timeout: 10000 });
        await expect
            .poll(
                () =>
                    osdBackground.evaluate(
                        (el) => window.getComputedStyle(el).opacity,
                    ),
                { timeout: 10000 },
            )
            .toBe('1');

        // Check that the canvas element inside OSD is created
        const canvas = page.locator('.openseadragon-canvas canvas').first();
        await expect(canvas).toBeVisible();

        // Check if the "Annotations" toggle is present and clickable
        const toggleButton = page.locator('#triiiceratops-viewer summary', {
            hasText: 'Annotations',
        });
        if (await toggleButton.isVisible()) {
            await expect(toggleButton).toBeVisible();
        }
    });
});
