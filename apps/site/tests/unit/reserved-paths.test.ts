/**
 * The collision guard's reserved-name logic, tested at the function its two
 * callers share: the site's own build (apps/site/vite.config.ts) and site
 * assembly (scripts/docs-publish.mjs). A guard spelled differently on both sides
 * is a guard that only half exists, so this is the seam that matters.
 */

import { describe, expect, it } from 'vitest';

import {
    RESERVED_TOP_LEVEL,
    collisionMessage,
    collisions,
    isReservedTopLevel,
    topLevelSegment,
} from '../../../../scripts/reserved-paths.mjs';

describe('the reserved top-level names', () => {
    it('holds every sibling subtree and publish-owned path in the root', () => {
        expect([...RESERVED_TOP_LEVEL].sort()).toEqual([
            'CNAME',
            'demo',
            'docs',
            'latest',
            'robots.txt',
            'social',
            'versions',
            'versions.json',
            'viewer',
        ]);
    });

    it('does not reserve sitemap.xml, which the site build produces', () => {
        // Assembly reads the site's own sitemap back out of the tree and
        // overwrites it with the site-wide one, so shadowing it loses nothing.
        expect(isReservedTopLevel('sitemap.xml')).toBe(false);
    });

    it('does not reserve the marketing routes', () => {
        for (const name of [
            'size',
            'handles',
            'configure',
            'install',
            'access',
            'production',
            'system',
            '404.html',
            '_app',
        ]) {
            expect(isReservedTopLevel(name)).toBe(false);
        }
    });
});

describe('topLevelSegment', () => {
    it('reads the first segment however the caller spells the path', () => {
        expect(topLevelSegment('docs')).toBe('docs');
        expect(topLevelSegment('/docs/')).toBe('docs');
        expect(topLevelSegment('./docs/1.0/index.html')).toBe('docs');
        expect(topLevelSegment('/')).toBe('');
    });
});

describe('collisions', () => {
    it('is empty for a tree that is safe to place', () => {
        expect(
            collisions(['index.html', '404.html', '_app', 'size', 'system']),
        ).toEqual([]);
    });

    it('names a route that would shadow a sibling subtree', () => {
        expect(collisions(['index.html', 'docs', 'viewer'])).toEqual([
            'docs',
            'viewer',
        ]);
    });

    it('reads a nested route path down to its top-level segment', () => {
        // `/docs/why-iiif/` is the hazard: the route reads as its own page and
        // the copy replaces the whole documentation subtree.
        expect(collisions(['/docs/why-iiif/'])).toEqual(['docs']);
    });

    it('reports each shadowed name once', () => {
        expect(collisions(['docs/a', 'docs/b'])).toEqual(['docs']);
    });
});

describe('collisionMessage', () => {
    it('names what collided and what to do about it', () => {
        const message = collisionMessage('A marketing route', ['docs']);
        expect(message).toContain('A marketing route');
        expect(message).toContain('docs');
        expect(message).toContain('Rename the route');
    });
});
