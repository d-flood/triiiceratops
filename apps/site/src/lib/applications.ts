/**
 * Which application a route is, declared for the one route that is an
 * application rather than a document.
 *
 * `/viewer/` is the bare viewer, and every published IIIF Cookbook recipe links
 * it directly through the cookbook's own `_includes/viewer_link.html`. Nothing
 * about the served tree distinguishes it from any other route that happens to
 * render a viewer, so a build that put a different page there would still
 * resolve — and would break roughly thirty-four recipes. It has gone wrong on
 * the deployed host once already.
 *
 * The marker is not copy — nothing a reader sees — so no rewording of a title or
 * a card can silently defeat it. `scripts/url-contract.mjs` asserts it over the
 * built tree against the `app` field in `site-urls.json`, and
 * `tests/unit/url-contract.test.ts` holds the two spellings to each other.
 */

/** The `meta` name the marker is written as. */
export const APP_MARKER = 'triiiceratops:app';

export const BARE_VIEWER_APP = 'viewer';
