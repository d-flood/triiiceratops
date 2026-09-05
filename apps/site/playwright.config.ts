import { defineConfig, devices } from '@playwright/test';

import { gpuChromium } from '../../scripts/playwright-gpu';

import {
    ORIGIN,
    PORT,
    PUBLISHED_ORIGIN,
    PUBLISHED_PORT,
} from './tests/helpers/origin';

/*
 * The marketing site's browser screens. This is the seam for what only a browser
 * can see: the rail on every route it carries, the mobile sheet opening, and the
 * appendix being reachable but `noindex`. Chromium only — the site is markup and
 * CSS, and core's own Playwright matrix is where cross-browser rendering is
 * settled.
 *
 * The score gate joins this suite rather than becoming a second harness.
 */
export default defineConfig({
    testDir: './tests',
    testMatch: '**/*.spec.ts',
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
            use: { ...devices['Desktop Chrome'], ...gpuChromium },
        },
    ],
    /*
     * Two servers, because the suite asks two different questions. Most screens
     * ask what the application renders, so they get the development server. The
     * score gate asks what the published site scores, so it gets the built
     * tree — see `tests/helpers/origin.ts` for why the distinction is load
     * bearing rather than tidiness.
     */
    webServer: [
        {
            command: `pnpm dev --port ${PORT} --host 127.0.0.1 --strictPort`,
            url: ORIGIN,
            /*
             * Never reuse: a readiness probe of a bare origin cannot tell this
             * app's dev server from another workspace app's on the same port,
             * and the suite would then run green against a stranger. A busy
             * port fails here instead.
             */
            reuseExistingServer: false,
        },
        {
            command: `node scripts/serve-published.mjs --root build --port ${PUBLISHED_PORT}`,
            url: PUBLISHED_ORIGIN,
            reuseExistingServer: false,
        },
    ],
});
