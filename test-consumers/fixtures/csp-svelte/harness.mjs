import { expect } from '@playwright/test';

import { collectCspViolations, formatViolations } from '../../shared/csp.mjs';

const NONCE = 'tri-csp-lightdom';

// csp-svelte: light-DOM consumer under strict CSP, zero violations, every engine.
export default {
    name: 'csp-svelte',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    browsers: ['chromium', 'firefox', 'webkit'],
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-image-manipulation',
        '@triiiceratops/plugin-pdf-export',
    ],
    async assert({ page, baseURL, pageErrors, browserName }) {
        const violations = await collectCspViolations(page);
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        const bg = await page.evaluate(() => {
            const el = document.querySelector('#triiiceratops-viewer');
            return getComputedStyle(el).backgroundColor;
        });
        expect(bg, 'viewer root should be styled under CSP').not.toBe(
            'rgba(0, 0, 0, 0)',
        );

        // Accessible name is the display title, not the package name.
        await expect(
            page.locator(
                '[data-flyout-toggle][aria-label="Image Adjustments"]',
            ),
        ).toBeAttached({
            timeout: 30_000,
        });

        // Nonce `<style>` fallback, carrying the page nonce.
        const pluginStyle = await page.evaluate(() => {
            const el = document.querySelector(
                'style[data-triiiceratops-plugin-style]',
            );
            return el
                ? { present: true, nonce: el.nonce || el.getAttribute('nonce') }
                : { present: false, nonce: null };
        });
        expect(
            pluginStyle.present,
            'plugin style installed via nonce <style> fallback',
        ).toBe(true);
        expect(
            pluginStyle.nonce,
            'plugin fallback <style> carries the page nonce',
        ).toBe(NONCE);

        // pdf-export's Svelte-scoped CSS takes the same nonce fallback.
        await page.getByRole('button', { name: 'Open Menu' }).click();
        const pdfButton = page.locator('[aria-label="PDF Export"]');
        await expect(pdfButton).toBeVisible({ timeout: 30_000 });
        await pdfButton.click();

        const bundledStyle = await page.evaluate(() => {
            const el = document.querySelector(
                'style[data-triiiceratops-plugin-style="@triiiceratops/plugin-pdf-export:bundled"]',
            );
            return el
                ? {
                      present: true,
                      nonce: el.nonce || el.getAttribute('nonce'),
                      hasScopedButton: /\.btn\.svelte-/.test(
                          el.textContent || '',
                      ),
                  }
                : { present: false, nonce: null, hasScopedButton: false };
        });
        expect(
            bundledStyle.present,
            'pdf-export build-extracted component CSS installed via nonce <style>',
        ).toBe(true);
        expect(
            bundledStyle.nonce,
            'pdf-export bundled <style> carries the page nonce',
        ).toBe(NONCE);
        expect(
            bundledStyle.hasScopedButton,
            'extracted CSS contains the @triiiceratops/ui Button scoped rule',
        ).toBe(true);

        const found = await violations.read();
        expect(
            found.length,
            `[${browserName}] CSP violations:\n${formatViolations(found)}`,
        ).toBe(0);

        expect(
            pageErrors.map((e) => e.message),
            'no uncaught page errors',
        ).toEqual([]);
    },
};
