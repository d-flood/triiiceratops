/**
 * Facts about the published site that both the page markup and the emitted
 * sitemap need in absolute form.
 *
 * Absolute, not relative: a relative `og:image` or `og:url` is the most common
 * cause of a blank preview card, and a sitemap `<loc>` must be a full URL.
 */

export const SITE_ROOT = 'https://triiiceratops.org/';
export const SITE_NAME = 'Triiiceratops IIIF Viewer';

/**
 * The one social preview image every route points at, unrenamed.
 *
 * Scrapers cache preview images by URL for days to weeks, so the `-v1` suffix is
 * the only way to invalidate that cache and renaming the file breaks every card
 * already in circulation. A route that later earns its own card gets a new
 * suffixed file alongside this one — see scripts/social-cards.README.md.
 */
export const OG_IMAGE = `${SITE_ROOT}social/og-landing-v1.png`;
export const OG_IMAGE_ALT =
    'Triiiceratops: a modern, lightweight, framework-agnostic IIIF viewer.';

export const TWITTER_HANDLE = '@FloodDavid';
export const FEDIVERSE_CREATOR = '@davidflood@fosstodon.org';
export const THEME_COLOR = '#e9ab2b';

export const REPOSITORY_URL = 'https://github.com/d-flood/triiiceratops';
export const CONTACT_URL = 'https://davidaflood.com/contact/';
export const LICENCE = 'MIT';

/**
 * The paths the rail's coloured link block points at.
 *
 * The documentation link uses the version-agnostic alias rather than a version
 * segment: the rail outlives release lines. All three are sibling subtrees the
 * publish job assembles, so they do not exist in this application's own build —
 * see the prerender error handling in svelte.config.js.
 */
export const PLAYGROUND_PATH = '/demo/';
export const DOCUMENTATION_PATH = '/latest/';
export const HOSTED_VIEWER_PATH = '/viewer/';

/** An absolute URL for a path within this site. */
export function absolute(path: string): string {
    return new URL(path, SITE_ROOT).href;
}
