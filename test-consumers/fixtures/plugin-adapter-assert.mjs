import { expect } from '@playwright/test';

// Shared assertion for the SDK framework-adapter fixtures.
export async function assertAdapterFixture({ page, baseURL, pageErrors }) {
    await page.goto(`${baseURL}/`, { waitUntil: 'load' });

    const value = page.locator('[data-testid="tri-plugin-value"]');

    await expect(value).toHaveText('closed', { timeout: 30_000 });

    await page.evaluate(() => window.__tri.toggle());
    await expect(value).toHaveText('open', { timeout: 30_000 });

    await page.evaluate(() => window.__tri.toggle());
    await expect(value).toHaveText('closed', { timeout: 30_000 });

    await page.evaluate(() => window.__tri.unmount());
    const cleanupRan = await page.evaluate(() => window.__tri.cleanupRan);
    expect(cleanupRan, 'plugin cleanup ran on deactivate').toBe(true);
    await expect(value).toHaveCount(0);

    expect(
        pageErrors.map((e) => e.message),
        'no uncaught page errors',
    ).toEqual([]);
}
