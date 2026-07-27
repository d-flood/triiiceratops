import { expect } from '@playwright/test';

import { collectCspViolations, formatViolations } from '../../shared/csp.mjs';

const NONCE = 'tri-csp-lightdom';

// csp-svelte: a Vite + Svelte light-DOM consumer built and served under a strict
// CSP (see index.html). Proves:
//   · the light-DOM viewer renders and is themed under `script-src 'self'` +
//     `style-src 'self' 'nonce-…'` (no unsafe-eval, no unsafe-inline for scripts),
//   · a real plugin's `context.styles.install` takes the nonce-aware `<style>`
//     fallback (the non-constructable branch) and carries the page nonce, and
//   · zero `securitypolicyviolation` events fire.
// Runs on every desktop engine (chromium, firefox, webkit).
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
    ],
    async assert({ page, baseURL, pageErrors, browserName }) {
        const violations = await collectCspViolations(page);
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        // The viewer mounts and OSD paints the first canvas under the strict CSP.
        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // Themed via the same-origin stylesheet (tokens applied, not UA default).
        const bg = await page.evaluate(() => {
            const el = document.querySelector('#triiiceratops-viewer');
            return getComputedStyle(el).backgroundColor;
        });
        expect(bg, 'viewer root should be styled under CSP').not.toBe(
            'rgba(0, 0, 0, 0)',
        );

        // The plugin activated (its toolbar toggle rendered), so its
        // `context.styles.install` ran.
        await expect(page.locator('[data-tri-im-toggle]')).toBeVisible({
            timeout: 30_000,
        });

        // Nonce fallback branch: the plugin style is a `<style>` element (not a
        // constructable sheet) carrying the page nonce, proving the style
        // service's non-constructable path ran and survives `style-src`.
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

        // Zero CSP violations across the whole journey.
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
