import { docsNav } from '$lib/docs';
import { isDocPath, isNavigable, nextDoc, nextNavigable } from '$lib/routes';
import { sitePages } from '$lib/server/pageMeta';

export const load = ({ url }) => {
    const path = url.pathname.replace(/(?<=\/)edit\/$/, '');
    const pages = sitePages();
    const onDocs = isDocPath(path);
    const next = onDocs ? nextDoc(path) : nextNavigable(path);

    return {
        path,
        docs: onDocs ? docsNav(pages) : undefined,
        nav: pages.filter(isNavigable),
        current: pages.find((page) => page.path === path),
        next: next && pages.find((page) => page.path === next.path),
    };
};
