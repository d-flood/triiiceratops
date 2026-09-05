/**
 * The documentation shell's two lists: the sidebar and the table of contents.
 *
 * The sidebar is declared and the contents are derived, which is the whole
 * distinction. Navigation order is an editorial argument, so it comes from
 * `$lib/routes` and a document nobody declared is not in it. A page's own
 * headings are the page's, so the contents come from the document — and take
 * their anchors from each heading's persisted slug, never from its text.
 */
import {
    DOC_ROUTES,
    DOC_SECTIONS,
    type DocSection,
    type SitePage,
} from './routes';

export type DocsNavItem = {
    readonly path: string;
    /** The page's short title, from its document's meta. */
    readonly title: string;
};

/** One block of the sidebar; `title` is `null` for the documentation home. */
export type DocsNavSection = {
    readonly title: DocSection | null;
    readonly items: readonly DocsNavItem[];
};

/**
 * The sidebar, from the declared documentation routes and the words the resolved
 * pages carry.
 *
 * A declared route with no resolved page is left out rather than rendered with
 * nothing to label it; the missing-document gate in `$lib/server/pageMeta` is
 * what reports that. A section whose pages are all absent is left out too — an
 * empty heading in a sidebar says only that somebody planned something.
 */
export function docsNav(pages: readonly SitePage[]): DocsNavSection[] {
    const words = new Map(pages.map((page) => [page.path, page.shortTitle]));

    const itemsIn = (section: DocSection | null): DocsNavItem[] =>
        DOC_ROUTES.filter((route) => route.section === section).flatMap(
            (route) => {
                const title = words.get(route.path);
                return title === undefined ? [] : [{ path: route.path, title }];
            },
        );

    return [null, ...DOC_SECTIONS]
        .map((section) => ({ title: section, items: itemsIn(section) }))
        .filter((section) => section.items.length > 0);
}

export type TocEntry = {
    /** The heading's persisted slug, which is also its anchor in the markup. */
    readonly id: string;
    readonly text: string;
    readonly level: number;
};

type TocNode = {
    readonly type?: string;
    readonly attrs?: Record<string, unknown> | null;
    readonly text?: string;
    readonly marks?: readonly unknown[];
    readonly content?: readonly TocNode[] | null;
};

/** The plain text of an inline subtree, in order and through its marks. */
function textOf(nodes: readonly TocNode[] | null | undefined): string {
    if (!nodes) return '';
    return nodes
        .map((node) =>
            typeof node.text === 'string' ? node.text : textOf(node.content),
        )
        .join('');
}

/**
 * A page's contents: its own headings, in the document's order.
 *
 * Only the document's top level is walked. A heading nested inside a block
 * belongs to that block's own layout, and putting it in the page's contents
 * would promise a section the page does not have.
 */
export function documentToc(document: {
    readonly content?: readonly TocNode[] | null;
}): TocEntry[] {
    const entries: TocEntry[] = [];
    for (const node of document.content ?? []) {
        if (node.type !== 'heading') continue;
        const slug = node.attrs?.slug;
        if (typeof slug !== 'string' || slug.length === 0) continue;
        entries.push({
            id: slug,
            text: textOf(node.content),
            level: Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2))),
        });
    }
    return entries;
}
