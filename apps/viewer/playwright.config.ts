import { defineConfig, devices } from '@playwright/test';

import { ORIGIN, PORT } from './tests/helpers/origin';

/*
 * Smoke screens, not a suite: the bare viewer is a public contract with an
 * external project (the IIIF cookbook links to it), and nothing else covers
 * that its URL opens a view. Chromium only — core's own Playwright matrix is
 * where cross-browser rendering is settled.
 */
export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    timeout: 60_000,
    reporter: 'list',
    use: {
        baseURL: ORIGIN,
        trace: 'on-first-retry',
        /*
         * Pinned so the chrome's accessible names are the same on every machine:
         * the app takes its locale from the browser, and a developer's Chromium
         * is whatever their system says.
         */
        locale: 'en-US',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: `pnpm dev --port ${PORT} --host 127.0.0.1`,
        url: ORIGIN,
        /*
         * Never reuse: a readiness probe of a bare origin cannot tell this app's
         * dev server from another workspace app's on the same port, and the
         * suite would then run green against a stranger. A busy port fails here
         * instead.
         */
        reuseExistingServer: false,
    },
});
