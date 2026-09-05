/**
 * One list of the site's pages, with each page's own words resolved.
 *
 * A content route's words live in its document's meta; a code route's live in
 * the route declaration. Everything the chrome renders — the rail's labels, the
 * document title, the description, the next-page link, each page's heading and
 * lede — reads this list, so neither kind of route is a special case anywhere
 * above it.
 *
 * The resolution is also the gate: a declared content route with no document
 * fails the build here, rather than prerendering a page with no heading. Its
 * reverse — a document nobody declared — cannot happen, because the route
 * declarations are what the content route's prerender entries come from.
 *
 * The documentation is in this list too. A documentation page's words live in
 * its document exactly as a marketing page's do, and everything above reads one
 * list, so the sidebar and the rail label their pages from the same resolution.
 */
import { readFileSync } from 'node:fs';

import { defaultMapPathToSource } from 'uncial-cms/sveltekit';

import { localContentDir } from '$lib/content';
import {
    DOC_ROUTES,
    ROUTES,
    isNavigable,
    type DocRoute,
    type PageMeta,
    type SitePage,
    type SiteRoute,
} from '$lib/routes';

function isFilled(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function documentMeta(path: string): PageMeta {
    const file = defaultMapPathToSource(path, localContentDir);
    let raw: string;
    try {
        raw = readFileSync(file, 'utf8');
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
        throw new Error(
            `The content route ${path} is declared in src/lib/routes.ts but ${file} does not exist.`,
        );
    }
    const { title, shortTitle, intro } =
        (JSON.parse(raw) as { meta?: Partial<PageMeta> }).meta ?? {};
    if (!isFilled(title) || !isFilled(shortTitle) || !isFilled(intro)) {
        throw new Error(
            `${file} must carry a title, a shortTitle and an intro in its meta; ${path} has no words without them.`,
        );
    }
    return { title, shortTitle, intro };
}

function resolve(route: SiteRoute): SitePage {
    const meta =
        route.source === 'code' ? route.meta : documentMeta(route.path);
    return {
        path: route.path,
        group: route.group,
        indexed: isNavigable(route),
        ...meta,
    };
}

/**
 * A documentation page. The rail does not carry it — the sidebar does — but it
 * is offered to a crawler like any other prose the site publishes, which is the
 * one combination the rail's grouping cannot express.
 */
function resolveDoc(route: DocRoute): SitePage {
    return {
        path: route.path,
        group: null,
        indexed: true,
        ...documentMeta(route.path),
    };
}

export function sitePages(): SitePage[] {
    return [...ROUTES.map(resolve), ...DOC_ROUTES.map(resolveDoc)];
}
