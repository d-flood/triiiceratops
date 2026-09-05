/**
 * Which application a route is, declared for the two routes that are
 * applications rather than documents.
 *
 * `/viewer/` is the bare viewer and `/demo/` is the playground. Both resolve,
 * both render a viewer, and both look plausible at the other's URL — so nothing
 * about the served tree distinguishes them except this marker, and a swap would
 * break every published IIIF Cookbook recipe, which link `/viewer/` directly.
 * It has gone wrong on the deployed host once already.
 *
 * The marker is not copy — nothing a reader sees — so no rewording of a title or
 * a card can silently defeat it. `scripts/url-contract.mjs` asserts it over the
 * built tree against the `app` field in `site-urls.json`, and
 * `tests/unit/url-contract.test.ts` holds the two spellings to each other.
 */

/** The `meta` name the marker is written as. */
export const APP_MARKER = 'triiiceratops:app';

export const PLAYGROUND_APP = 'demo';

export const BARE_VIEWER_APP = 'viewer';
