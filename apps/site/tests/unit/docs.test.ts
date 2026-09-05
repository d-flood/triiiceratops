/**
 * The two pure functions the documentation shell is built from: the sidebar,
 * which is declared, and the table of contents, which is derived.
 *
 * They are separated here on purpose. The sidebar must never learn what is on
 * disk — a page appears in it because somebody declared it, not because
 * somebody wrote a file. The table of contents is the opposite: it must never
 * learn anything but what the document says, and specifically it must take its
 * anchors from each heading's persisted slug rather than from the heading's
 * text, so that retitling a section does not break a link into it.
 */

import { describe, expect, it } from 'vitest';

import { docsNav, documentToc } from '$lib/docs';
import { DOC_ROUTES, DOC_SECTIONS, type SitePage } from '$lib/routes';

/** A resolved page, as `$lib/server/pageMeta` hands one to the chrome. */
function page(path: string, shortTitle: string): SitePage {
    return {
        path,
        group: null,
        indexed: true,
        title: shortTitle,
        shortTitle,
        intro: `What ${shortTitle} is for.`,
    };
}

const DECLARED = DOC_ROUTES.map((route) => page(route.path, route.path));

function heading(level: number, text: string, slug?: string) {
    return {
        type: 'heading',
        attrs: slug === undefined ? { level } : { level, slug },
        content: [{ type: 'text', text }],
    };
}

describe('the documentation sidebar', () => {
    it('carries every declared page', () => {
        const paths = docsNav(DECLARED).flatMap((section) =>
            section.items.map((item) => item.path),
        );
        expect([...paths].sort()).toEqual(
            DOC_ROUTES.map((route) => route.path).sort(),
        );
    });

    it('opens with the documentation home, above every section', () => {
        const [first] = docsNav(DECLARED);
        expect(first.title).toBe(null);
        expect(first.items.map((item) => item.path)).toEqual(['/docs/']);
    });

    it('orders its sections as they are declared', () => {
        const titles = docsNav(DECLARED)
            .map((section) => section.title)
            .filter((title) => title !== null);
        // A section with no pages yet is absent rather than empty, so this is
        // the declared order with the gaps taken out.
        expect(titles).toEqual(
            DOC_SECTIONS.filter((section) => titles.includes(section)),
        );
    });

    it('leaves out a page nobody declared', () => {
        const nav = docsNav([
            ...DECLARED,
            page('/docs/undeclared/', 'Undeclared'),
        ]);
        const paths = nav.flatMap((section) =>
            section.items.map((item) => item.path),
        );
        expect(paths).not.toContain('/docs/undeclared/');
    });

    it('leaves out a declared page with no words resolved for it', () => {
        // The missing-document gate is what reports this; the sidebar's job is
        // to not render a link with nothing to label it.
        expect(docsNav([])).toEqual([]);
    });

    it('labels each item with the page’s own short title', () => {
        const nav = docsNav([page('/docs/', 'Documentation')]);
        expect(nav[0].items).toEqual([
            { path: '/docs/', title: 'Documentation' },
        ]);
    });
});

describe('a page’s table of contents', () => {
    it('anchors each entry at the heading’s persisted slug, not at its text', () => {
        const toc = documentToc({
            content: [
                heading(2, 'Adding a plugin (renamed)', 'adding-a-plugin'),
            ],
        });
        expect(toc).toEqual([
            {
                id: 'adding-a-plugin',
                text: 'Adding a plugin (renamed)',
                level: 2,
            },
        ]);
    });

    it('leaves out a heading carrying no persisted slug', () => {
        // Normalization stamps one on every heading, so this is a document that
        // never reached the renderer. Deriving an anchor here instead would put
        // a link in the contents that rots on the next edit.
        expect(documentToc({ content: [heading(2, 'No slug here')] })).toEqual(
            [],
        );
    });

    it('keeps the document’s own order and each heading’s level', () => {
        const toc = documentToc({
            content: [
                heading(2, 'First', 'first'),
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Prose.' }],
                },
                heading(3, 'Under the first', 'under-the-first'),
                heading(2, 'Second', 'second'),
            ],
        });
        expect(toc.map((entry) => `${entry.level}:${entry.id}`)).toEqual([
            '2:first',
            '3:under-the-first',
            '2:second',
        ]);
    });

    it('reads a heading’s text through the marks it carries', () => {
        const toc = documentToc({
            content: [
                {
                    type: 'heading',
                    attrs: { level: 2, slug: 'the-viewer-config-option' },
                    content: [
                        { type: 'text', text: 'The ' },
                        {
                            type: 'text',
                            text: 'config',
                            marks: [{ type: 'code' }],
                        },
                        { type: 'text', text: ' option' },
                    ],
                },
            ],
        });
        expect(toc[0].text).toBe('The config option');
    });

    it('is empty for a document with no headings', () => {
        expect(documentToc({ content: [] })).toEqual([]);
        expect(documentToc({})).toEqual([]);
    });
});
