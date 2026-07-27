import { test, expect } from '@playwright/test';

test.describe('Triiiceratops Viewer', () => {
    test('smoke test: loads viewer and canvas', async ({ page }) => {
        // Navigate to the app
        await page.goto('/?manifest=/demo-manifests/e2e/manifest.json', {
            waitUntil: 'domcontentloaded',
        });

        // Verify basic page structure
        await expect(page.locator('#triiiceratops-viewer')).toBeVisible();

        // Wait for manifest loading to complete (spinners should disappear)
        const spinner = page.locator('.loading');
        await expect(spinner).not.toBeVisible({ timeout: 20000 });

        // Check for error state
        const errorMsg = page.locator('.error-text');
        if (await errorMsg.isVisible()) {
            const text = await errorMsg.textContent();
            console.error(`Viewer reported error: ${text}`);
            throw new Error(`Viewer failed to load: ${text}`);
        }

        // Now check for OSD viewer
        const viewer = page.locator('#triiiceratops-viewer .osd-background');
        await expect(viewer).toBeVisible({ timeout: 10000 });

        // Check that the canvas element inside OSD is created
        const canvas = page.locator('#triiiceratops-viewer canvas').first();
        await expect(canvas).toBeVisible();

        // Check if the "Annotations" toggle is present and clickable
        const toggleButton = page.locator('#triiiceratops-viewer summary', {
            hasText: 'Annotations',
        });
        if (await toggleButton.isVisible()) {
            await expect(toggleButton).toBeVisible();
        }

        const annotationsButton = page
            .locator(
                '#triiiceratops-viewer button[aria-label*="annotations" i]',
            )
            .first();
        if (await annotationsButton.isVisible()) {
            const panel = page.getByRole('dialog', { name: 'Annotations' });

            await annotationsButton.click({ force: true });
            await expect(panel).toBeVisible();

            await annotationsButton.click({ force: true });
            await expect(panel).toBeHidden();
        }
    });
});
