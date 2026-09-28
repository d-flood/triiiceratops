import { absolute } from '$lib/site';

/* Disallows nothing: the two noindex pages carry it in their own markup, which a `Disallow` would stop crawlers reading. */
export const prerender = true;

export function GET(): Response {
    return new Response(
        `User-agent: *\nAllow: /\nSitemap: ${absolute('/sitemap.xml')}\n`,
        { headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
}
