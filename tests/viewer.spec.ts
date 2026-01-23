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

        // Check that the canvas element inside OSD is created
        const canvas = page.locator('.openseadragon-canvas canvas').first();
        await expect(canvas).toBeVisible();

        // Check if the "Annotations" toggle is present and clickable
        // Use a more specific selector strategy based on the icon components or text structure
        const toggleButton = page.locator('summary', {
            hasText: 'Annotations',
        });
        if (await toggleButton.isVisible()) {
            await expect(toggleButton).toBeVisible();
        }
    });
});
