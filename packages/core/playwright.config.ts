import { defineConfig, devices } from '@playwright/test';

import { E2E_ORIGIN, E2E_PORT } from './tests/helpers/origin';
import { gpuChromium } from '../../scripts/playwright-gpu';

// Desktop projects (chromium, firefox, webkit) run the core journeys; mobile
// projects (android-chrome, mobile-webkit) run only the mobile journey set,
// selected with the `@mobile` tag. Desktop projects run every spec (the mobile
// journey is a core journey too, so it also runs there); mobile projects filter
// to `@mobile` via `grep`. Browser-specific skips are expressed inline in the
// specs with a reason (e.g. `test.skip(({ browserName }) => …, 'reason')`).
//
// The accessibility suite pins itself to Chromium at the spec level
// (`browserName !== 'chromium'` skips), so it is unaffected by the wider desktop
// matrix here.
export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    // Firefox/WebKit cold-load the viewer's large bundle over the Vite dev server;
    // 60s gives headroom over the 30s default on slower/CI runners.
    timeout: 60_000,
    reporter: 'html',
    use: {
        // Shared with the specs that need an absolute URL; set `E2E_PORT` to
        // run on a port of your own. See `tests/helpers/origin.ts`.
        baseURL: E2E_ORIGIN,
        trace: 'on-first-retry',
    },
    projects: [
        // ── Desktop projects: run the core journeys ────────────────────────
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], ...gpuChromium },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
        // ── Mobile projects: run only the `@mobile` journey set ─────────────
        {
            name: 'android-chrome',
            use: { ...devices['Pixel 7'], ...gpuChromium },
            grep: /@mobile/,
        },
        {
            name: 'mobile-webkit',
            use: { ...devices['iPhone 13'] },
            grep: /@mobile/,
        },
    ],
    webServer: {
        command: `pnpm dev --port ${E2E_PORT} --host 127.0.0.1`,
        // The harness page, not `/`: the package ships no root document, so a
        // readiness probe against the origin gets a 404 and never resolves.
        url: `${E2E_ORIGIN}/e2e/harness.html`,
        reuseExistingServer: !process.env.CI,
    },
});
