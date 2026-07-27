import { expect } from '@playwright/test';

import { collectCspViolations, formatViolations } from '../../shared/csp.mjs';

// csp-trusted-types: the self-contained Web Component IIFE + a plugin IIFE under
// `require-trusted-types-for 'script'` (Chromium only — the only engine that
// enforces Trusted Types today). Proves the viewer + a plugin render with core's
// pass-through Trusted Types default policy handling every Svelte/`{@html}` DOM
// sink, with zero policy violations and no uncaught errors.
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

        // The custom element renders under Trusted Types (Svelte's
        // `<template>.innerHTML` is a TT sink; the default policy certifies it).
        await expect(page.locator('triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // A plugin also operates under Trusted Types (its `{@html}` icons go
        // through the same policy).
        await expect(page.locator('[data-tri-im-toggle]')).toBeVisible({
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
