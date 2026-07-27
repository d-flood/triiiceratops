import { expect } from '@playwright/test';

import { collectCspViolations, formatViolations } from '../../shared/csp.mjs';

const NONCE = 'tri-csp-wc';

// csp-wc-iife: the self-contained Web Component IIFE + a plugin IIFE, served as a
// no-bundler page under a strict CSP (see index.html). Proves:
//   · the custom element renders with its shadow-root styles under a strict
//     `script-src 'self' 'nonce-…'`,
//   · a real plugin (activated through the shared `window.Triiiceratops`
//     registry) installs styles into the shadow root via the nonce-aware
//     `<style>` fallback, carrying the page nonce, and
//   · zero `securitypolicyviolation` events fire.
// Runs on every desktop engine (chromium, firefox, webkit).
export default {
    name: 'csp-wc-iife',
    buildScript: null,
    serveDir: '.',
    manifestTarget: 'manifest.json',
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

        // The custom element upgrades and OSD paints inside the shadow root.
        await expect(page.locator('triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // The plugin activated via the shared namespace; its toolbar toggle (in
        // the shadow root) rendered, so `context.styles.install` ran.
        await expect(page.locator('[data-tri-im-toggle]')).toBeVisible({
            timeout: 30_000,
        });

        // Nonce fallback branch, this time into the shadow root: the plugin
        // `<style>` element carries the page nonce.
        const pluginStyle = await page.evaluate(() => {
            const host = document.getElementById('v');
            const el = host?.shadowRoot?.querySelector(
                'style[data-triiiceratops-plugin-style]',
            );
            return el
                ? { present: true, nonce: el.nonce || el.getAttribute('nonce') }
                : { present: false, nonce: null };
        });
        expect(
            pluginStyle.present,
            'plugin style installed via nonce <style> fallback in shadow root',
        ).toBe(true);
        expect(
            pluginStyle.nonce,
            'plugin fallback <style> carries the page nonce',
        ).toBe(NONCE);

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
