/**
 * The pages the marketing chrome renders around, resolved once per page.
 *
 * A content route's words come from its document and a code route's from the
 * route declaration, so the resolution needs the filesystem — which is why it is
 * a server load. Every route prerenders, so this runs at build time and its
 * result is baked into the page.
 */
import { docsNav } from '$lib/docs';
import { isDocPath, isNavigable, nextDoc, nextNavigable } from '$lib/routes';
import { sitePages } from '$lib/server/pageMeta';

export const load = ({ url }) => {
    // An edit variant is the page it edits, wearing the same head, rail position
    // and next-page link — that is the whole point of editing inside the layout.
    // These routes exist on the development server only.
    const path = url.pathname.replace(/(?<=\/)edit\/$/, '');
    const pages = sitePages();
    const onDocs = isDocPath(path);
    // The documentation reads through rather than circling: its chain ends at
    // the last declared page instead of sending the reader back to the front.
    const next = onDocs ? nextDoc(path) : nextNavigable(path);

    return {
        path,
        /**
         * The documentation sidebar, on documentation pages only. Declared, so a
         * document nobody declared is absent from it — which is what keeps the
         * architecture decision records and the internal security notes out of
         * every published navigation.
         */
        docs: onDocs ? docsNav(pages) : undefined,
        /** The rail's items, the sheet's, and the front page's onward list. */
        nav: pages.filter(isNavigable),
        /**
         * The page being served, or `undefined` for a path no route declares,
         * which inside this layout is the not-found page.
         */
        current: pages.find((page) => page.path === path),
        next: next && pages.find((page) => page.path === next.path),
    };
};
