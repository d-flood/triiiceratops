/**
 * Serving `@triiiceratops/plugin-annotation-editor`'s built dist to its fixture
 * page.
 *
 * The plugin lives outside the dev server's root, so every spec that loads it
 * installs a route. The whole dist directory is served rather than the entry
 * alone, mirroring `avPluginDist.ts`: a chunk that appears later would 404
 * silently, and the failure would read as "the editor never activated".
 *
 * These specs also need CORE's built element, and there is one way to lose it
 * that does not look like a build problem: **`pnpm api:report` wipes
 * `packages/core/dist`**. Run `pnpm build:element` again after it, or the next
 * run fails on a fixture page whose viewer never loaded.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { Page } from '@playwright/test';

const DIST = join(
    import.meta.dirname,
    '../../../plugin-annotation-editor/dist',
);

/** The plugin entry the fixture loads, so a spec can assert it was built. */
export const PLUGIN_IIFE = join(DIST, 'iife.js');

/**
 * Serve the plugin's whole dist under `/plugin-annotation-editor/`.
 *
 * Only the file's own basename is honoured, so a request cannot escape the dist
 * directory; anything not built is a 404, which is what an unhosted chunk would
 * be in production.
 */
export async function serveAnnotationEditorDist(page: Page): Promise<void> {
    await page.route('**/plugin-annotation-editor/*.js', (route) => {
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
