// Canonical pages, navigation order and crawl policy. Content routes hold their
// own words in Uncial documents, resolved by `$lib/server/pageMeta`.

/** The rail's three tint groups, or `null` for a route the rail does not carry. */
export type RailGroup = 1 | 2 | 3 | null;

/** A page's own words: its heading, the rail's label for it, and its lede. */
export type PageMeta = {
    /** The page's heading. */
    readonly title: string;
    /** The document title, numbered rail label and mobile location label. */
    readonly shortTitle: string;
    /** One real sentence saying what the page is for. */
    readonly intro: string;
};

type RoutePosition = {
    /** Path within the site, with a leading and trailing slash. */
    readonly path: string;
    readonly group: RailGroup;
    readonly indexed?: boolean;
};

/** A route whose body and words are one Uncial document under `content/`. */
export type ContentRoute = RoutePosition & { readonly source: 'content' };

/**
 * A route rendered from code, which therefore carries its own words here.
 *
 * Two kinds of page qualify. Most are pages whose figures are computed from
 * committed data: a page whose credibility rests on being generated must not
 * gain an edit button. The front page and `/features/` are the other kind — their
 * bodies are running viewers rather than prose, so a document would hold nothing
 * but the heading and the lede and the edit variant would open on an empty
 * editor.
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
 * Indexing is independent of numbered rail membership: the builder and
 * documentation remain discoverable through their own navigation.
 */
export type SitePage = RoutePosition & PageMeta & { readonly indexed: boolean };

export const ROUTES: readonly SiteRoute[] = [
    {
        path: '/',
        group: 1,
        source: 'code',
        meta: {
            title: 'A modern, lightweight, and fully featured IIIF viewer',
            shortTitle: 'Overview',
            intro: 'Triiiceratops installs as a typed React, Vue, or Svelte component, or as one script tag in any HTML page, with layout and theme fully configurable.',
        },
    },
    {
        path: '/features/',
        group: 1,
        source: 'code',
        meta: {
            title: 'What it can do',
            shortTitle: 'What it can do',
            intro: 'Explore the following (non-exhaustive) features of Triiiceratops.',
        },
    },
    {
        path: '/size/',
        group: 1,
        source: 'code',
        meta: {
            title: 'Small and mighty',
            shortTitle: 'Small and mighty',
            intro: 'Triiiceratops is currently both the smallest and most capable embeddable IIIF viewer.',
        },
    },
    { path: '/accessibility/', group: 2, source: 'content' },
    { path: '/production/', group: 2, source: 'content' },
    { path: '/install/', group: 3, source: 'content' },
    {
        path: '/configure/',
        group: null,
        indexed: true,
        source: 'code',
        meta: {
            title: 'Build your viewer',
            shortTitle: 'Build your viewer',
            intro: 'Here you can easily create a layout and theme configuration for your viewer. Share the resulting configuration with others.',
        },
    },
    {
        path: '/demo/',
        // Out of the rail for the same reason as `/system/`: a maintainer's
        // bench is not one of the arguments the site is making, and a search
        // for a IIIF viewer should not land on it.
        group: null,
        source: 'code',
        meta: {
            title: 'IIIF Cookbook recipes',
            shortTitle: 'Cookbook recipes',
            intro: 'Every Cookbook recipe the workspace tracks, on one running viewer, with what it does with each.',
        },
    },
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
export const DOC_SECTIONS = [
    'Get started',
    'Guides',
    'Plugins',
    'Build a plugin',
] as const;

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
 * Grouped in section order, because the sidebar flattens to this list: a page
 * declared out of its section's run would render under the right heading and in
 * the wrong place, and `tests/docs.spec.ts` holds the served order to this one.
 *
 * The order within a section is the order a reader meets the ideas, not
 * alphabetical: the framework guides lead with the two wrappers, the guides
 * lead with configuration because everything else assumes it and end with the
 * policy a deployment needs, and the plugin pages put the system before the
 * plugins. Authoring and testing a plugin are their own section: they are the
 * only two pages addressed to somebody writing one rather than using one, and
 * they read as a pair.
 */
export const DOC_ROUTES: readonly DocRoute[] = [
    { path: '/docs/', section: null, source: 'content' },
    { path: '/docs/react/', section: 'Get started', source: 'content' },
    { path: '/docs/vue/', section: 'Get started', source: 'content' },
    { path: '/docs/svelte/', section: 'Get started', source: 'content' },
    { path: '/docs/integration/', section: 'Get started', source: 'content' },
    { path: '/docs/configuration/', section: 'Guides', source: 'content' },
    { path: '/docs/theming/', section: 'Guides', source: 'content' },
    { path: '/docs/content-state/', section: 'Guides', source: 'content' },
    { path: '/docs/csp/', section: 'Guides', source: 'content' },
    { path: '/docs/plugins/', section: 'Plugins', source: 'content' },
    { path: '/docs/plugin-av/', section: 'Plugins', source: 'content' },
    {
        path: '/docs/plugin-annotation-editor/',
        section: 'Plugins',
        source: 'content',
    },
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
    {
        path: '/docs/plugin-authoring/',
        section: 'Build a plugin',
        source: 'content',
    },
    {
        path: '/docs/plugin-testing/',
        section: 'Build a plugin',
        source: 'content',
    },
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

/** Whether a route belongs to the numbered introduction. */
export function isNavigable(route: { readonly group: RailGroup }): boolean {
    return route.group !== null;
}

/** The builder is indexed even though it lives only in the action block. */
export function isIndexed(route: {
    readonly group: RailGroup;
    readonly indexed?: boolean;
}): boolean {
    return route.indexed ?? isNavigable(route);
}

/** The numbered rail's items, in the argument's order. */
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
