/**
 * Every content route, rendered from its document on disk.
 *
 * Specific routes win over this catch-all in Kit's route resolution, so the
 * routes that render from code are untouched by it. The route declarations are
 * authoritative for what gets built: a document nobody declared is never
 * prerendered, and a declared route with no document fails the gate in
 * `$lib/server/pageMeta` rather than emitting an empty page.
 */
import { error } from '@sveltejs/kit';
import { createContentHandlers } from 'uncial-cms/sveltekit';

import { blocks, localContentDir, schema, siteConfig } from '$lib/content';
import { documentToc } from '$lib/docs';
import { CONTENT_ROUTES, isDocPath } from '$lib/routes';

const handlers = createContentHandlers({
    config: siteConfig,
    blocks,
    schema,
    localContentDir,
});

/** The declared content routes, as this route's rest parameter. */
export const entries = () =>
    CONTENT_ROUTES.map((route) => ({ path: route.path.slice(1, -1) }));

export const load = async (event: Parameters<typeof handlers.load>[0]) => {
    try {
        const data = await handlers.load(event);
        // The contents are derived here rather than in the page component so
        // that the deriving costs a reader nothing: every route prerenders, so
        // this runs at build time and only the list reaches the browser.
        return {
            ...data,
            toc: isDocPath(`/${event.params.path}/`)
                ? documentToc(data.document)
                : undefined,
        };
    } catch (cause) {
        // This route matches every path no specific route claims, so a path
        // with no document is not found. While prerendering, that 404 is a
        // broken link and `svelte.config.js` fails the build on it — with
        // `/examples/` the one exception, because those pages are copied into
        // the tree after the render.
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
            error(404, 'Not found');
        }
        throw cause;
    }
};
