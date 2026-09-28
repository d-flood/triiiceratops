import {
    DOC_ROUTES,
    DOC_SECTIONS,
    type DocSection,
    type SitePage,
} from './routes';

export type DocsNavItem = {
    readonly path: string;
    readonly title: string;
};

export type DocsNavSection = {
    readonly title: DocSection | null;
    readonly items: readonly DocsNavItem[];
};

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

function textOf(nodes: readonly TocNode[] | null | undefined): string {
    if (!nodes) return '';
    return nodes
        .map((node) =>
            typeof node.text === 'string' ? node.text : textOf(node.content),
        )
        .join('');
}

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
