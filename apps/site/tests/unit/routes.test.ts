/**
 * The route declaration, which is the one place the rail, the next-page link,
 * the emitted sitemap and each page's `robots` meta are derived from.
 *
 * What is asserted here is the split between what the site navigates to and what
 * it withholds from a crawler — the failure that cannot be seen in a browser,
 * because it is a disagreement between a page's markup and a file a crawler
 * reads. A route's own words are not asserted here: they live in its document's
 * meta, and `tests/unit/url-contract.test.ts` gates their presence.
 */

import { describe, expect, it } from 'vitest';

import {
    CONTENT_ROUTES,
    DOC_ROUTES,
    DOC_SECTIONS,
    NAV,
    ROUTES,
    isDocPath,
    isNavigable,
    nextDoc,
    nextNavigable,
    routeAt,
} from '$lib/routes';

describe('the route declaration', () => {
    it('declares eight routes', () => {
        expect(ROUTES).toHaveLength(8);
    });

    it('gives every route a leading and trailing slash', () => {
        for (const route of ROUTES) {
            expect(route.path.startsWith('/')).toBe(true);
            expect(route.path.endsWith('/')).toBe(true);
        }
    });

    it('carries the seven rail pages plus one route out of the rail', () => {
        expect(ROUTES.filter((r) => r.group !== null)).toHaveLength(7);
        expect(ROUTES.filter((r) => r.group === null)).toHaveLength(1);
    });

    it('keeps the front page in the rail and offered for indexing', () => {
        // The canonical URL for the project as a whole. The site-wide sitemap
        // names it either way, so a front page that were unlisted here would put
        // a `noindex` on a page the sitemap offers.
        const front = routeAt('/');
        expect(front).toBeDefined();
        expect(isNavigable(front!)).toBe(true);
    });

    it('navigates to every grouped route', () => {
        // The rail's whole job is showing the argument's shape. The item heights
        // depend on the list being whole too: they divide the rail's height
        // between them.
        expect(NAV).toHaveLength(7);
        expect(NAV.every(isNavigable)).toBe(true);
    });

    it('renders the five editable routes from content and the rest from code', () => {
        expect(CONTENT_ROUTES.map((route) => route.path)).toEqual([
            '/',
            '/handles/',
            '/install/',
            '/access/',
            '/production/',
            // The documentation is content too, and served by the same
            // catch-all, so it prerenders and is gated through the same list.
            ...DOC_ROUTES.map((route) => route.path),
        ]);
        // The three that stay code-backed derive every figure they carry from
        // committed data, so they must not gain an edit button.
        expect(
            ROUTES.filter((route) => route.source === 'code').map(
                (route) => route.path,
            ),
        ).toEqual(['/size/', '/configure/', '/system/']);
    });
});

const grouped = { path: '/x/', group: 1, source: 'content' } as const;
const ungrouped = { path: '/y/', group: null, source: 'content' } as const;

describe('isNavigable', () => {
    it('carries a route the rail carries', () => {
        expect(isNavigable(grouped)).toBe(true);
    });

    it('excludes a route the rail does not carry', () => {
        expect(isNavigable(ungrouped)).toBe(false);
    });
});

describe('nextNavigable', () => {
    it('only ever continues to a route the rail carries', () => {
        for (const route of ROUTES) {
            const next = nextNavigable(route.path);
            if (next === undefined) continue;
            expect(isNavigable(next)).toBe(true);
            expect(next.path).not.toBe(route.path);
        }
    });

    it('never sends a reader to the page they are already on', () => {
        for (const route of NAV) {
            expect(nextNavigable(route.path)?.path).not.toBe(route.path);
        }
    });

    it('offers nothing when only one route is navigable', () => {
        // With a single navigable route there is nowhere for the argument to
        // continue, and a link pointing back at the current page is worse than
        // no link at all.
        if (NAV.length === 1) {
            expect(nextNavigable(NAV[0].path)).toBeUndefined();
        }
    });
});

describe('the documentation declaration', () => {
    it('lives entirely under /docs/', () => {
        for (const route of DOC_ROUTES) {
            expect(isDocPath(route.path)).toBe(true);
            expect(route.path.endsWith('/')).toBe(true);
        }
    });

    it('declares no page twice, and none the marketing rail already carries', () => {
        const paths = DOC_ROUTES.map((route) => route.path);
        expect(new Set(paths).size).toBe(paths.length);
        for (const route of ROUTES) {
            expect(paths).not.toContain(route.path);
        }
    });

    it('puts every page in a declared section, or in the home’s place above them', () => {
        for (const route of DOC_ROUTES) {
            if (route.section === null) continue;
            expect(DOC_SECTIONS).toContain(route.section);
        }
    });

    it('opens with the documentation home', () => {
        expect(DOC_ROUTES[0]).toMatchObject({ path: '/docs/', section: null });
    });
});

describe('nextDoc', () => {
    it('follows the declared order', () => {
        for (const [index, route] of DOC_ROUTES.entries()) {
            expect(nextDoc(route.path)?.path).toBe(DOC_ROUTES[index + 1]?.path);
        }
    });

    it('ends at the last page rather than circling back', () => {
        expect(nextDoc(DOC_ROUTES[DOC_ROUTES.length - 1].path)).toBeUndefined();
    });

    it('offers nothing for a path the documentation does not declare', () => {
        expect(nextDoc('/handles/')).toBeUndefined();
    });
});
