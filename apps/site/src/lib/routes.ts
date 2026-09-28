// Canonical pages, navigation order and crawl policy.
export type RailGroup = 1 | 2 | 3 | null;

export type PageMeta = {
    readonly title: string;
    readonly shortTitle: string;
    readonly intro: string;
};

type RoutePosition = {
    readonly path: string;
    readonly group: RailGroup;
    readonly indexed?: boolean;
};

export type ContentRoute = RoutePosition & { readonly source: 'content' };

export type CodeRoute = RoutePosition & {
    readonly source: 'code';
    readonly meta: PageMeta;
};

export type SiteRoute = ContentRoute | CodeRoute;

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
        group: null,
        source: 'code',
        meta: {
            title: 'Design system',
            shortTitle: 'Design system',
            intro: 'An appendix: every design token the site is built from, with the measured contrast ratio that admitted it.',
        },
    },
];

export const DOC_SECTIONS = [
    'Get started',
    'Guides',
    'Plugins',
    'Build a plugin',
] as const;

export type DocSection = (typeof DOC_SECTIONS)[number];

export type DocRoute = {
    readonly path: string;
    readonly section: DocSection | null;
    readonly source: 'content';
};

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

export const DOCS_ROOT = '/docs/';

export function isDocPath(path: string): boolean {
    return path.startsWith(DOCS_ROOT);
}

export function docRouteAt(path: string): DocRoute | undefined {
    return DOC_ROUTES.find((route) => route.path === path);
}

export function nextDoc(path: string): DocRoute | undefined {
    const current = DOC_ROUTES.findIndex((route) => route.path === path);
    if (current === -1) return undefined;
    return DOC_ROUTES[current + 1];
}

export function isNavigable(route: { readonly group: RailGroup }): boolean {
    return route.group !== null;
}

export function isIndexed(route: {
    readonly group: RailGroup;
    readonly indexed?: boolean;
}): boolean {
    return route.indexed ?? isNavigable(route);
}

export const NAV: readonly SiteRoute[] = ROUTES.filter(isNavigable);

export const CONTENT_ROUTES: readonly { readonly path: string }[] = [
    ...ROUTES.filter(
        (route): route is ContentRoute => route.source === 'content',
    ),
    ...DOC_ROUTES,
];

export function routeAt(path: string): SiteRoute | undefined {
    return ROUTES.find((route) => route.path === path);
}

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
