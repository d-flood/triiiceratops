import { LISTED } from '$lib/routes';
import { absolute } from '$lib/site';

/**
 * The marketing site's own sitemap, prerendered to `sitemap.xml` at the root of
 * this application's build.
 *
 * Adding a page is one edit — the declaration in `routes.ts` — and the appendix
 * and any route still carrying filler are absent, because a page nobody may
 * index must not be offered for indexing.
 *
 * Site assembly re-roots these entries into the site-wide sitemap, the way it
 * re-roots the documentation generator's, and owns `/sitemap.xml` in the
 * published tree; this file is its input. See `writeSitemap` in
 * scripts/docs-publish.mjs.
 */
export const prerender = true;

const XML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
};

/** No current route needs this; a route added later with a query or an ampersand does. */
function xmlEscape(text: string): string {
    return text.replaceAll(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

export function GET(): Response {
    const body = LISTED.map(
        (route) =>
            `  <url>\n    <loc>${xmlEscape(absolute(route.path))}</loc>\n  </url>`,
    ).join('\n');
    return new Response(
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            `${body}\n</urlset>\n`,
        { headers: { 'content-type': 'application/xml' } },
    );
}
