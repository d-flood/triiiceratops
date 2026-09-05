/**
 * The route declaration, which is the one place the rail, the next-page link,
 * the emitted sitemap and each page's `robots` meta are derived from.
 *
 * What is asserted here is the filler policy holding across all four consumers
 * at once — the failure that cannot be seen in a browser, because it is a
 * disagreement between a page's markup and a file a crawler reads.
 */

import { describe, expect, it } from 'vitest';

import { ROUTES, LISTED, isListed, nextListed, routeAt } from '$lib/routes';
import { RESERVED_TOP_LEVEL } from '../../../../scripts/reserved-paths.mjs';

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

    it('gives every route a real introductory sentence', () => {
        for (const route of ROUTES) {
            expect(route.intro.length).toBeGreaterThan(40);
            expect(route.intro.endsWith('.')).toBe(true);
        }
    });

    it('shadows no sibling subtree', () => {
        const reserved = new Set(RESERVED_TOP_LEVEL);
        for (const route of ROUTES) {
            expect(reserved.has(route.path.split('/')[1])).toBe(false);
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
        expect(isListed(front!)).toBe(true);
    });
});

describe('isListed', () => {
    it('excludes a route whose prose has not landed', () => {
        expect(
            isListed({
                path: '/x/',
                title: 'x',
                shortTitle: 'x',
                intro: 'x',
                group: 1,
                copy: 'filler',
            }),
        ).toBe(false);
    });

    it('excludes a route the rail does not carry', () => {
        expect(
            isListed({
                path: '/x/',
                title: 'x',
                shortTitle: 'x',
                intro: 'x',
                group: null,
                copy: 'real',
            }),
        ).toBe(false);
    });
});

describe('nextListed', () => {
    it('skips every route whose prose has not landed', () => {
        for (const route of ROUTES) {
            const next = nextListed(route.path);
            if (next === undefined) continue;
            expect(isListed(next)).toBe(true);
            expect(next.path).not.toBe(route.path);
        }
    });

    it('never sends a reader to the page they are already on', () => {
        for (const route of LISTED) {
            expect(nextListed(route.path)?.path).not.toBe(route.path);
        }
    });

    it('offers nothing when only one route is listed', () => {
        // With a single listed route there is nowhere for the argument to
        // continue, and a link pointing back at the current page is worse than
        // no link at all.
        if (LISTED.length === 1) {
            expect(nextListed(LISTED[0].path)).toBeUndefined();
        }
    });
});
