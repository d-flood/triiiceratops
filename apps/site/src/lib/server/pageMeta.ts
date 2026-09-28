import { readFileSync } from 'node:fs';

import { defaultMapPathToSource } from 'uncial-cms/sveltekit';

import { localContentDir } from '$lib/content';
import {
    DOC_ROUTES,
    ROUTES,
    isIndexed,
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
        indexed: isIndexed(route),
        ...meta,
    };
}

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
