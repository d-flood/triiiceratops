/**
 * The edit variant of every content route, on the development server only.
 *
 * `devOnly` resolves the route's prerender entries to an empty list outside
 * development, so a production build emits none of these pages. Nothing links to
 * them, so strict prerendering never looks for them either.
 */
import { createEditorHandlers } from 'uncial-cms/sveltekit';

import { blocks, localContentDir, schema, siteConfig } from '$lib/content';

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
    const { sourcePath, path } = await handlers.load(event);
    return { sourcePath, pagePath: path };
};
