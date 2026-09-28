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

export const load = async (event: Parameters<typeof handlers.load>[0]) => {
    const editing = `/${event.params.path}/`.replace('//', '/');
    if (!CONTENT_ROUTES.some((route) => route.path === editing)) {
        error(404, 'Not an editable page');
    }
    const { sourcePath, pagePath } = await handlers.load(event);
    return { sourcePath, pagePath };
};
