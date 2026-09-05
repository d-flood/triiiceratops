// The top-level names in the published tree that the marketing site may not own.
//
// The site is assembled INTO a root that already holds sibling subtrees, so a
// marketing route whose first path segment matches one of those names is copied
// straight over it. The design record singles this out as the only decision in
// the site's design that cannot be undone later: the sibling paths are already in
// bookmarks, issue threads and possibly a citation, and a published IIIF Cookbook
// recipe links `/viewer/` directly.
//
// `scripts/url-contract.mjs` check 4 CANNOT catch it. That check warns about
// top-level names no owner accounts for; a route named `docs` produces a name
// that IS accounted for — by the documentation subtree — so it stays silent while
// the copy has already overwritten it. Hence two checks of their own, sharing
// this module so they cannot disagree:
//
//   1. `apps/site/vite.config.ts` fails the site's own build (and its dev
//      server) from the route manifest, while a route is being edited.
//   2. `scripts/docs-publish.mjs` asserts the same thing about the site build's
//      top-level entries immediately before placing them, and fails the publish.
//
// `apps/site/svelte.config.js` reads the same set for a third, unrelated
// purpose: a link from a marketing page INTO a sibling subtree is expected to
// 404 while prerendering, because that subtree is assembled by the publish job
// and does not exist in the site's own build.

/**
 * Sibling subtrees, publish-owned paths, and the host's domain file.
 *
 * `sitemap.xml` is deliberately ABSENT. It is publish-owned, but it is also the
 * one publish-owned name the site build is expected to produce: the site emits
 * its own sitemap, and the publish job re-roots it into the site-wide one from
 * the very file the copy places. Nothing of another owner's is lost.
 */
export const RESERVED_TOP_LEVEL = Object.freeze([
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

const RESERVED = new Set(RESERVED_TOP_LEVEL);

/** True when `name` is a top-level name the marketing site may not own. */
export function isReservedTopLevel(name) {
    return RESERVED.has(name);
}

/**
 * The first path segment of `path`, which is the top-level name it would occupy
 * in the published root. Leading slashes and a `./` prefix are tolerated so a
 * caller can pass a route path, a build-output entry name, or either with or
 * without a leading slash.
 */
export function topLevelSegment(path) {
    return path.replace(/^\.?\/+/, '').split('/')[0];
}

/**
 * The members of `paths` that would shadow a reserved sibling, sorted and
 * deduplicated. Empty means the tree is safe to place.
 *
 * Both callers compare through this one function: a guard spelled differently on
 * both sides is a guard that only half exists.
 */
export function collisions(paths) {
    const found = new Set();
    for (const path of paths) {
        const segment = topLevelSegment(path);
        if (isReservedTopLevel(segment)) found.add(segment);
    }
    return [...found].sort();
}

/** The failure message both callers print, so the fix reads the same either way. */
export function collisionMessage(what, colliding) {
    return (
        `${what} would shadow ${colliding.length} reserved top-level ` +
        `name(s): ${colliding.join(', ')}.\n` +
        '  The published root already holds these as sibling subtrees or ' +
        'publish-owned paths, and placing the site over one of them is ' +
        'unrecoverable: the sibling URLs are already in bookmarks, issue ' +
        'threads and published IIIF Cookbook recipes.\n' +
        `  Rename the route. The reserved set is ${RESERVED_TOP_LEVEL.join(', ')} ` +
        '(see scripts/reserved-paths.mjs).'
    );
}
