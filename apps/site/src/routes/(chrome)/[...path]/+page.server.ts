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

export const entries = () =>
    CONTENT_ROUTES.map((route) => ({ path: route.path.slice(1, -1) }));

export const load = async (event: Parameters<typeof handlers.load>[0]) => {
    try {
        const { document, meta } = await handlers.load(event);
        return {
            document,
            meta,
            toc: isDocPath(`/${event.params.path}/`)
                ? documentToc(document)
                : undefined,
        };
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
            error(404, 'Not found');
        }
        throw cause;
    }
};
