/**
 * The edit variant of every content route, on the development server only.
 *
 * `devOnly` resolves the route's prerender entries to an empty list outside
 * development, so a production build emits none of these pages. Nothing links to
 * them, so strict prerendering never looks for them either.
 */
import { error } from '@sveltejs/kit';
import { createEditorHandlers } from 'uncial-cms/sveltekit';

import { blocks, localContentDir, schema, siteConfig } from '$lib/content';
import { CONTENT_ROUTES } from '$lib/routes';

const handlers = createEditorHandlers({
    config: siteConfig,
    blocks,
    schema,
    localContentDir,
    devOnly: true,
});

export const entries = handlers.entries;

/**
 * `sourcePath` is the document to edit and `pagePath` is Uncial's own rest
 * parameter — slashless, and what the editor names the page by.
 *
 * Neither is called `path`. An edit variant is the page it edits, wearing the
 * same head, rail position and sidebar, and every one of those reads the chrome
 * layout's `path`: a page load returning that key would shadow it with the
 * slashless form and the edit variant would stop being the page it edits.
 */
export const load = async (event: Parameters<typeof handlers.load>[0]) => {
    // This route matches every path, including the ones that render from code
    // and so have no document. Without the gate those paths open the editor on
    // nothing, which reads as the editor being broken rather than as the page
    // not being editable.
    const editing = `/${event.params.path}/`.replace('//', '/');
    if (!CONTENT_ROUTES.some((route) => route.path === editing)) {
        error(404, 'Not an editable page');
    }
    const { sourcePath, path } = await handlers.load(event);
    return { sourcePath, pagePath: path };
};
