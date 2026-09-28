export const SITE_ROOT = 'https://triiiceratops.org/';
export const SITE_NAME = 'Triiiceratops IIIF Viewer';

/* Suffixed: scrapers cache preview images by URL, so the suffix invalidates. */
export const OG_IMAGE = `${SITE_ROOT}social/og-landing-v1.png`;
export const OG_IMAGE_ALT =
    'Triiiceratops: a modern, lightweight, framework-agnostic IIIF viewer.';

export const DOCS_OG_IMAGE = `${SITE_ROOT}social/og-docs-v1.png`;
export const DOCS_OG_IMAGE_ALT =
    'Triiiceratops: a IIIF viewer with first-class React, Vue and Svelte components, plus a web component for Django, WordPress or plain HTML.';

export const TWITTER_HANDLE = '@FloodDavid';
export const FEDIVERSE_CREATOR = '@davidflood@fosstodon.org';
export const THEME_COLOR = '#e9ab2b';

export const REPOSITORY_URL = 'https://github.com/d-flood/triiiceratops';
export const CONTACT_URL = 'https://davidaflood.com/contact/';
export const LICENCE = 'MIT';

export const HOSTED_VIEWER_PATH = '/viewer/';
export const BUILDER_PATH = '/configure/';
export const DOCUMENTATION_PATH = '/docs/';

export const SEARCH_BUNDLE_PATH = '/pagefind/pagefind.js';

export function absolute(path: string): string {
    return new URL(path, SITE_ROOT).href;
}
