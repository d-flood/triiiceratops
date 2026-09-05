/**
 * Every route the site owns, declared once: the eight marketing routes and the
 * documentation.
 *
 * The rail, the documentation sidebar, the next-page link, the emitted sitemap
 * and each page's `robots` meta are all derived from these lists. Independent
 * lists would disagree, and a disagreement between what a reader is offered and
 * what a crawler is offered is invisible until a crawler finds it.
 *
 * Order is the order of the argument the site makes, which is the rail's order
 * and the next-page link's order. This module holds path, order and grouping
 * only: a content route's own words live in its document's meta, and
 * `$lib/server/pageMeta` is what resolves the two into one list.
 */

/** The rail's three tint groups, or `null` for a route the rail does not carry. */
export type RailGroup = 1 | 2 | 3 | null;

/** A page's own words: its heading, the rail's label for it, and its lede. */
export type PageMeta = {
    /** The rail's label, and the page's own heading. */
    readonly title: string;
    /** The document title, and the rail's slim-bar "where am I" label. */
    readonly shortTitle: string;
    /** One real sentence saying what the page is for. */
    readonly intro: string;
};

type RoutePosition = {
    /** Path within the site, with a leading and trailing slash. */
    readonly path: string;
    readonly group: RailGroup;
};

/** A route whose body and words are one Uncial document under `content/`. */
export type ContentRoute = RoutePosition & { readonly source: 'content' };

/**
 * A route rendered from code, which therefore carries its own words here.
 *
 * Every figure on these pages is computed from committed data. A page whose
 * credibility rests on being generated must not gain an edit button, so they are
 * deliberately not content documents and their prose lives with the code that
 * derives the rest of them.
 */
export type CodeRoute = RoutePosition & {
    readonly source: 'code';
    readonly meta: PageMeta;
};

export type SiteRoute = ContentRoute | CodeRoute;

/**
 * A route with its words resolved: what the chrome, the rail and each page's
 * heading actually render from. `$lib/server/pageMeta` builds the list.
 *
 * `indexed` is carried rather than recomputed because the rail and the crawler
 * do not agree. A marketing route the rail withholds is an appendix nobody
 * should index; a documentation page is the other combination — offered to a
 * crawler, absent from the rail, because the sidebar is what navigates to it.
 */
export type SitePage = RoutePosition & PageMeta & { readonly indexed: boolean };

export const ROUTES: readonly SiteRoute[] = [
    { path: '/', group: 1, source: 'content' },
    {
        path: '/size/',
        group: 1,
        source: 'code',
        meta: {
            title: 'Size and capability',
            shortTitle: 'Size and capability',
            intro: 'Every viewer in this field is measured here at three compression levels against how much of IIIF it implements, so the size claim reads as analysis rather than marketing.',
        },
    },
    { path: '/handles/', group: 1, source: 'content' },
    {
        path: '/configure/',
        group: 2,
        source: 'code',
        meta: {
            title: 'Configure it',
            shortTitle: 'Configure it',
            intro: 'Set the viewer’s appearance and chrome against your own manifest, then send the result as a URL to whoever will implement it.',
        },
    },
    { path: '/install/', group: 2, source: 'content' },
    { path: '/access/', group: 3, source: 'content' },
    { path: '/production/', group: 3, source: 'content' },
    {
        path: '/system/',
        // Out of the rail by design, and therefore `noindex` and out of the
        // sitemap: an appendix must not compete with a real page for a query.
        group: null,
        source: 'code',
        meta: {
            title: 'Design system',
            shortTitle: 'Design system',
            intro: 'An appendix: every design token the site is built from, with the measured contrast ratio that admitted it.',
        },
    },
];

/**
 * The documentation sidebar's sections, in the order the sidebar shows them.
 *
 * A section is an editorial argument about what a reader looks for first, which
 * is why the sidebar is declared here and not derived from `content/docs/`.
 * Derivation would also mean a new file appearing in the published navigation
 * the moment it is written. The architecture decision records and the internal
 * security notes stay Markdown in the repository's own `docs/` directory: they
 * are not content documents, so no declaration can reach them.
 */
export const DOC_SECTIONS = ['Get started', 'Guides', 'Plugins'] as const;

export type DocSection = (typeof DOC_SECTIONS)[number];

/**
 * One documentation page. `section` is `null` for the documentation home, which
 * the sidebar carries above every section.
 */
export type DocRoute = {
    readonly path: string;
    readonly section: DocSection | null;
    readonly source: 'content';
};

/**
 * Every documentation page, in the sidebar's order within each section.
 *
 * The order within a section is the order a reader meets the ideas, not
 * alphabetical: the framework guides lead with the two wrappers, the guides
 * lead with configuration because everything else assumes it, and the plugin
 * pages put the system before the plugins and the authoring guide last.
 */
export const DOC_ROUTES: readonly DocRoute[] = [
    { path: '/docs/', section: null, source: 'content' },
    { path: '/docs/react/', section: 'Get started', source: 'content' },
    { path: '/docs/vue/', section: 'Get started', source: 'content' },
    { path: '/docs/svelte/', section: 'Get started', source: 'content' },
    { path: '/docs/integration/', section: 'Get started', source: 'content' },
    { path: '/docs/configuration/', section: 'Guides', source: 'content' },
    { path: '/docs/theming/', section: 'Guides', source: 'content' },
    { path: '/docs/csp/', section: 'Guides', source: 'content' },
    { path: '/docs/content-state/', section: 'Guides', source: 'content' },
    { path: '/docs/plugins/', section: 'Plugins', source: 'content' },
    { path: '/docs/plugin-av/', section: 'Plugins', source: 'content' },
    {
        path: '/docs/plugin-image-manipulation/',
        section: 'Plugins',
        source: 'content',
    },
    {
        path: '/docs/plugin-image-export/',
        section: 'Plugins',
        source: 'content',
    },
    { path: '/docs/plugin-pdf-export/', section: 'Plugins', source: 'content' },
    { path: '/docs/plugin-authoring/', section: 'Plugins', source: 'content' },
    { path: '/docs/plugin-testing/', section: 'Plugins', source: 'content' },
];

/** The path every documentation route lives under. */
export const DOCS_ROOT = '/docs/';

export function isDocPath(path: string): boolean {
    return path.startsWith(DOCS_ROOT);
}

export function docRouteAt(path: string): DocRoute | undefined {
    return DOC_ROUTES.find((route) => route.path === path);
}

/**
 * Where the documentation continues: the next declared page after `path`, and
 * `undefined` at the last one. Documentation is read through rather than
 * circled, so the chain ends instead of wrapping the way the rail's does.
 */
export function nextDoc(path: string): DocRoute | undefined {
    const current = DOC_ROUTES.findIndex((route) => route.path === path);
    if (current === -1) return undefined;
    return DOC_ROUTES[current + 1];
}

/**
 * Whether the site navigates to a route, and equally whether it offers the route
 * to a crawler: the rail's items, the next-page link's chain, the front page's
 * onward list, the sitemap's entries, and the absence of `noindex`.
 *
 * Group membership alone decides all of it, so it takes anything carrying a
 * group — a route declaration, or a resolved page. The branch merges only when
 * every declared route renders real prose, so there is no state in which a
 * reachable page must be withheld from a search result.
 */
export function isNavigable(route: { readonly group: RailGroup }): boolean {
    return route.group !== null;
}

/** The rail's items and the sitemap's entries, in the argument's order. */
export const NAV: readonly SiteRoute[] = ROUTES.filter(isNavigable);

/**
 * Every route whose body is a content document — marketing and documentation
 * alike — which is what the content route prerenders and what the
 * missing-document gate is asserted against.
 *
 * One catch-all route serves them all, so a documentation page is a content
 * route that happens to live under `/docs/` rather than a second mechanism.
 */
export const CONTENT_ROUTES: readonly { readonly path: string }[] = [
    ...ROUTES.filter(
        (route): route is ContentRoute => route.source === 'content',
    ),
    ...DOC_ROUTES,
];

export function routeAt(path: string): SiteRoute | undefined {
    return ROUTES.find((route) => route.path === path);
}

/**
 * Where the argument continues: the next navigable route after `path`, wrapping
 * to the start so the last page sends the reader back to the beginning rather
 * than to a dead end.
 *
 * Returns `undefined` when `path` is the only navigable route — there is nowhere
 * to continue to, and a next-page link pointing at the page the reader is on is
 * worse than none.
 */
export function nextNavigable(path: string): SiteRoute | undefined {
    if (NAV.length < 2) return undefined;
    const current = ROUTES.findIndex((route) => route.path === path);
    if (current === -1) return NAV[0];
    for (let step = 1; step <= ROUTES.length; step++) {
        const candidate = ROUTES[(current + step) % ROUTES.length];
        if (candidate.path !== path && isNavigable(candidate)) return candidate;
    }
    return undefined;
}
