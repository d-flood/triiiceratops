import { defineConfig, devices } from '@playwright/test';

import { launchOptions } from '../../scripts/playwright-gpu';

import {
    ORIGIN,
    PORT,
    PUBLISHED_ORIGIN,
    PUBLISHED_PORT,
} from './tests/helpers/origin';

export default defineConfig({
    testDir: './tests',
    testMatch: '**/*.spec.ts',
    globalSetup: '../../scripts/playwright-gpu.ts',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    timeout: 60_000,
    reporter: 'list',
    use: { baseURL: ORIGIN, trace: 'on-first-retry', locale: 'en-US' },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: launchOptions('chromium'),
            },
        },
    ],
    webServer: [
        {
            command: `pnpm dev --port ${PORT} --host 127.0.0.1 --strictPort`,
            url: ORIGIN,
            /* A bare-origin probe cannot tell this dev server from a stranger's. */
            reuseExistingServer: false,
        },
        {
            command: `node scripts/serve-published.mjs --root build --port ${PUBLISHED_PORT}`,
            url: PUBLISHED_ORIGIN,
            reuseExistingServer: false,
        },
    ],
});
