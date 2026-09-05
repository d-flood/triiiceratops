import { DOC_ROUTES, NAV } from '$lib/routes';
import { absolute } from '$lib/site';

/**
 * The site's sitemap, prerendered to `sitemap.xml` at the root of this
 * application's build — which is the root of the published tree.
 *
 * Adding a page is one edit — the declaration in `routes.ts` — and the appendix
 * is absent, because a page nobody may index must not be offered for indexing.
 * The documentation is here with the rail's pages: the rail does not carry it,
 * but it is published prose and a crawler is offered it.
 *
 * This is the published sitemap: one build emits the whole tree, so nothing
 * re-roots or merges it afterwards. The playground and the bare viewer are
 * deliberately absent — a canvas application is not prose a crawler has any use
 * for, and `/sitemap.xml`'s entry in site-urls.json says so.
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
    const body = [...NAV, ...DOC_ROUTES]
        .map(
            (route) =>
                `  <url>\n    <loc>${xmlEscape(absolute(route.path))}</loc>\n  </url>`,
        )
        .join('\n');
    return new Response(
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            `${body}\n</urlset>\n`,
        { headers: { 'content-type': 'application/xml' } },
    );
}
