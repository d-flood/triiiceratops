/**
 * The site's eight routes, declared once.
 *
 * The rail, the next-page link, the emitted sitemap and each page's `robots`
 * meta are all derived from this list. Three independent lists would disagree,
 * and the disagreement — a page linked from the rail but marked `noindex`, say —
 * is invisible until a crawler finds it.
 *
 * Order is the order of the argument the site makes, which is the rail's order
 * and the next-page link's order.
 */

/** The rail's three tint groups, or `null` for a route the rail does not carry. */
export type RailGroup = 1 | 2 | 3 | null;

/**
 * Whether a route's prose has landed.
 *
 * A route still carrying filler is unlinked from the rail, skipped by the
 * next-page link, `noindex`, and absent from the sitemap — but still served, and
 * still in the URL contract. Landing the site before the prose exists must not
 * mean publishing filler on the pages arguing the project is credible.
 */
export type CopyState = 'real' | 'filler';

export type SiteRoute = {
    /** Path within the site, with a leading and trailing slash. */
    readonly path: string;
    /** The rail's label, and the page's own heading. */
    readonly title: string;
    /** The document title, and the rail's slim-bar "where am I" label. */
    readonly shortTitle: string;
    /** One real sentence saying what the page is for. Never filler. */
    readonly intro: string;
    readonly group: RailGroup;
    readonly copy: CopyState;
};

export const ROUTES: readonly SiteRoute[] = [
    {
        path: '/',
        title: 'A modern, lightweight, framework-agnostic IIIF viewer',
        shortTitle: 'Overview',
        intro: 'Triiiceratops renders IIIF manifests in React, Vue, Svelte, or plain HTML, and it is the smallest viewer in its field.',
        group: 1,
        copy: 'real',
    },
    {
        path: '/size/',
        title: 'Size and capability',
        shortTitle: 'Size and capability',
        intro: 'Every viewer in this field is measured here at three compression levels against how much of IIIF it implements, so the size claim reads as analysis rather than marketing.',
        group: 1,
        copy: 'real',
    },
    {
        path: '/handles/',
        title: 'What it handles',
        shortTitle: 'What it handles',
        intro: 'Bound codices with structures, single large sheets, photographic series, annotated material and right-to-left material, each shown running.',
        group: 1,
        copy: 'filler',
    },
    {
        path: '/configure/',
        title: 'Configure it',
        shortTitle: 'Configure it',
        intro: 'Set the viewer’s appearance and chrome against your own manifest, then send the result as a URL to whoever will implement it.',
        group: 2,
        copy: 'filler',
    },
    {
        path: '/install/',
        title: 'Install and frameworks',
        shortTitle: 'Install and frameworks',
        intro: 'What the two lines on the front page cannot cover: framework specifics, versioning, and bundler notes.',
        group: 2,
        copy: 'filler',
    },
    {
        path: '/access/',
        title: 'Accessibility and standards',
        shortTitle: 'Accessibility and standards',
        intro: 'Which standards the viewer holds itself to, how that is enforced rather than asserted, and where the gates live.',
        group: 3,
        copy: 'filler',
    },
    {
        path: '/production/',
        title: 'In production',
        shortTitle: 'In production',
        intro: 'Real deployments you can open, because a working link into a live reading room is the strongest evidence this site can carry.',
        group: 3,
        copy: 'filler',
    },
    {
        path: '/system/',
        title: 'Design system',
        shortTitle: 'Design system',
        intro: 'An appendix: every design token the site is built from, with the measured contrast ratio that admitted it.',
        // Out of the rail by design, and therefore `noindex` and out of the
        // sitemap: an appendix must not compete with a real page for a query.
        group: null,
        copy: 'real',
    },
];

/**
 * Whether a route is offered to a reader and to a crawler.
 *
 * One predicate rather than three flags. A route the rail carries, a route the
 * sitemap names, and a route without `noindex` are the same set by definition,
 * so they are the same expression.
 */
export function isListed(route: SiteRoute): boolean {
    return route.group !== null && route.copy === 'real';
}

/** The rail's items, and the sitemap's entries, in the argument's order. */
export const LISTED: readonly SiteRoute[] = ROUTES.filter(isListed);

export function routeAt(path: string): SiteRoute | undefined {
    return ROUTES.find((route) => route.path === path);
}

/**
 * Where the argument continues: the next listed route after `path`, wrapping to
 * the start so the last page sends the reader back to the beginning rather than
 * to a dead end.
 *
 * Returns `undefined` when `path` is the only listed route — there is nowhere to
 * continue to, and a next-page link pointing at the page the reader is on is
 * worse than none.
 */
export function nextListed(path: string): SiteRoute | undefined {
    if (LISTED.length < 2) return undefined;
    const current = ROUTES.findIndex((route) => route.path === path);
    if (current === -1) return LISTED[0];
    for (let step = 1; step <= ROUTES.length; step++) {
        const candidate = ROUTES[(current + step) % ROUTES.length];
        if (candidate.path !== path && isListed(candidate)) return candidate;
    }
    return undefined;
}
