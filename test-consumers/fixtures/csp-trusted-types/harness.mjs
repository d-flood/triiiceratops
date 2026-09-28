import { expect } from '@playwright/test';

import { collectCspViolations, formatViolations } from '../../shared/csp.mjs';

// csp-trusted-types: IIFEs under `require-trusted-types-for 'script'`, chromium only.
export default {
    name: 'csp-trusted-types',
    buildScript: null,
    serveDir: '.',
    manifestTarget: 'manifest.json',
    browser: true,
    browsers: ['chromium'],
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-image-manipulation',
    ],
    async assert({ page, baseURL, pageErrors, browserName }) {
        const violations = await collectCspViolations(page);
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        await expect(page.locator('triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // Accessible name is the display title, not the package name.
        await expect(
            page.locator(
                '[data-flyout-toggle][aria-label="Image Adjustments"]',
            ),
        ).toBeAttached({
            timeout: 30_000,
        });

        const found = await violations.read();
        expect(
            found.length,
            `[${browserName}] Trusted Types / CSP violations:\n${formatViolations(found)}`,
        ).toBe(0);

        expect(
            pageErrors.map((e) => e.message),
            'no uncaught page errors under Trusted Types',
        ).toEqual([]);
    },
};
