/**
 * Serving `@triiiceratops/plugin-av`'s built dist to the AV fixture page.
 *
 * The plugin lives outside the dev server's root, so every AV spec installs a
 * route for it. It is a helper rather than a copy per spec because the plugin's
 * dist is a DIRECTORY, not a file: `iife.js` fetches `av-waveform.js` and
 * `av-hls.js` from beside itself, resolved against its own script URL. A route
 * that served only the entry would leave those chunks 404ing, and the failure
 * would look like "the waveform never drew" or "the stream will not play"
 * rather than like a missing route.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { Page } from '@playwright/test';

const DIST = join(import.meta.dirname, '../../../plugin-av/dist');

/** The plugin entry the fixture loads, so a spec can assert it was built. */
export const PLUGIN_IIFE = join(DIST, 'iife.js');

/**
 * Serve the plugin's whole dist under `/plugin-av/`.
 *
 * Only the file's own basename is honoured, so a request cannot escape the
 * dist directory; anything not built is a 404, which is exactly what an
 * unhosted chunk would be in production.
 */
export async function serveAvPluginDist(page: Page): Promise<void> {
    await page.route('**/plugin-av/*.js', (route) => {
        const file = join(
            DIST,
            basename(new URL(route.request().url()).pathname),
        );
        if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({
            contentType: 'text/javascript',
            body: readFileSync(file, 'utf8'),
        });
    });
}
