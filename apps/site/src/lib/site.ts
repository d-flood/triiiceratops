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
 * The marketing routes' social preview image, unrenamed.
 *
 * Scrapers cache preview images by URL for days to weeks, so the `-v1` suffix is
 * the only way to invalidate that cache and renaming the file breaks every card
 * already in circulation. The two routes that earn a card of their own — the
 * documentation and the playground — carry the suffixed files declared below,
 * under the same contract; see scripts/social-cards.README.md.
 */
export const OG_IMAGE = `${SITE_ROOT}social/og-landing-v1.png`;
export const OG_IMAGE_ALT =
    'Triiiceratops: a modern, lightweight, framework-agnostic IIIF viewer.';

/**
 * The documentation's own card, under the same cache contract.
 *
 * Scrapers cache a preview image by URL for weeks and every documentation link
 * already shared points at this one, so this name and this URL are fixed. Where
 * the file sits in the repository is not: the URL is the contract.
 */
export const DOCS_OG_IMAGE = `${SITE_ROOT}social/og-docs-v1.png`;
export const DOCS_OG_IMAGE_ALT =
    'Triiiceratops: an IIIF viewer with first-class React, Vue and Svelte components, plus a web component for Django, WordPress or plain HTML.';

/**
 * The playground's own card, under the same cache contract.
 *
 * It gets one of its own because the two links promise different things: /demo/
 * says "click and it runs", so the card shows the viewer actually running. See
 * scripts/social-cards.mjs.
 */
export const PLAYGROUND_OG_IMAGE = `${SITE_ROOT}social/og-viewer-v1.png`;
export const PLAYGROUND_OG_IMAGE_ALT =
    "The Triiiceratops viewer displaying a Greek New Testament papyrus fragment, with the live demo's URL.";

export const TWITTER_HANDLE = '@FloodDavid';
export const FEDIVERSE_CREATOR = '@davidflood@fosstodon.org';
export const THEME_COLOR = '#e9ab2b';

export const REPOSITORY_URL = 'https://github.com/d-flood/triiiceratops';
export const CONTACT_URL = 'https://davidaflood.com/contact/';
export const LICENCE = 'MIT';

/**
 * The paths the rail's coloured link block points at.
 *
 * The playground, the bare viewer and the documentation are all routes of this
 * application, so each of these resolves within its own build and a link that
 * does not is a real broken link.
 */
export const PLAYGROUND_PATH = '/demo/';
export const DOCUMENTATION_PATH = '/docs/';
export const HOSTED_VIEWER_PATH = '/viewer/';

/**
 * The search bundle's entry, written by the post-build indexer.
 *
 * A published path rather than a module specifier: the bundle is produced from
 * the built HTML after the bundler has finished, so nothing can import it at
 * build time. It is an entry in `site-urls.json` for the same reason every other
 * promised path is.
 */
export const SEARCH_BUNDLE_PATH = '/pagefind/pagefind.js';

/** An absolute URL for a path within this site. */
export function absolute(path: string): string {
    return new URL(path, SITE_ROOT).href;
}
