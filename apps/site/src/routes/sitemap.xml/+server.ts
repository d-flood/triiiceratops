import { DOC_ROUTES, ROUTES, isIndexed } from '$lib/routes';
import { absolute } from '$lib/site';

export const prerender = true;

const XML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
};

function xmlEscape(text: string): string {
    return text.replaceAll(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

export function GET(): Response {
    const body = [...ROUTES.filter(isIndexed), ...DOC_ROUTES]
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
