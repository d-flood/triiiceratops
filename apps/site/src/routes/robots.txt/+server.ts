import { absolute } from '$lib/site';

/**
 * The crawl policy, prerendered to `robots.txt` at the root of this
 * application's build — which is the root of the published tree.
 *
 * It disallows nothing: every path this site serves is a path it wants read, and
 * the two pages that must not compete for a query carry `noindex` in their own
 * markup instead. A `Disallow` would stop the crawl, which would stop the
 * crawler ever reading that `noindex`.
 *
 * A route rather than a file in `static/`, so the sitemap it names is derived
 * from the same origin constant every canonical URL and every `og:url` is.
 */
export const prerender = true;

export function GET(): Response {
    return new Response(
        `User-agent: *\nAllow: /\nSitemap: ${absolute('/sitemap.xml')}\n`,
        { headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
}
