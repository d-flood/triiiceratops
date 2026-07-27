import { expect } from '@playwright/test';

// Shared Playwright assertion for the SDK framework-adapter fixtures
// (plugin-react, plugin-vue, plugin-lit, plugin-svelte).
//
// Every adapter fixture mounts a plugin through the SDK mount contract against a
// live `ViewerState`, renders the selected `toolbarOpen` value, then exposes a
// tiny `window.__tri` control surface. This assertion drives the same journey
// for all of them: initial value shown → command flips it → clean unmount runs
// the plugin's cleanup and removes its UI. Runs from the driver process (not
// copied into the built consumer), so it can be shared across fixtures.
//
// This module is imported by each fixture's `harness.mjs`; it is not a fixture
// itself, so it is excluded from the driver's FIXTURES list.
export async function assertAdapterFixture({ page, baseURL, pageErrors }) {
    await page.goto(`${baseURL}/`, { waitUntil: 'load' });

    const value = page.locator('[data-testid="tri-plugin-value"]');

    // The adapter renders the initial selected state (toolbar starts closed).
    await expect(value).toHaveText('closed', { timeout: 30_000 });

    // A command flips the selected member; the adapter reacts on the batched
    // notification flush.
    await page.evaluate(() => window.__tri.toggle());
    await expect(value).toHaveText('open', { timeout: 30_000 });

    // And back, proving ongoing reactivity (not a one-shot).
    await page.evaluate(() => window.__tri.toggle());
    await expect(value).toHaveText('closed', { timeout: 30_000 });

    // Clean unmount: the plugin's cleanup runs and its UI is gone.
    await page.evaluate(() => window.__tri.unmount());
    const cleanupRan = await page.evaluate(() => window.__tri.cleanupRan);
    expect(cleanupRan, 'plugin cleanup ran on deactivate').toBe(true);
    await expect(value).toHaveCount(0);

    expect(
        pageErrors.map((e) => e.message),
        'no uncaught page errors',
    ).toEqual([]);
}
