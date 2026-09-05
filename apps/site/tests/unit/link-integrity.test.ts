/**
 * The internal link gate's resolution logic, against deliberately broken
 * documents.
 *
 * The run that walks the real content tree is the `links:check` script; what is
 * exercised here is the pure resolution — every
 * way a link can fail to resolve, and the one that matters most, which is that
 * an anchor is checked against a heading's persisted slug and never against
 * anything derived from its text.
 */
import { describe, expect, it } from 'vitest';

import { brokenLinks } from '../../scripts/check-links.mjs';

type Node = Record<string, unknown>;

/** A paragraph carrying one link, as a document normalizes it. */
function link(href: string): Node {
    return {
        type: 'paragraph',
        content: [
            {
                type: 'text',
                text: 'see this',
                marks: [{ type: 'link', attrs: { href } }],
            },
        ],
    };
}

function heading(text: string, slug: string): Node {
    return {
        type: 'heading',
        attrs: { level: 2, slug },
        content: [{ type: 'text', text }],
    };
}

function doc(path: string, content: Node[]) {
    return {
        path,
        file: `content${path === '/' ? '/index' : path.slice(0, -1)}.json`,
        document: { content },
    };
}

/** The paths the tree publishes that no content document backs. */
const PUBLISHED = ['/size/', '/examples/svelte/'];

describe('brokenLinks', () => {
    it('passes a link to a declared route', () => {
        const documents = [
            doc('/docs/', [link('/docs/react/')]),
            doc('/docs/react/', []),
        ];
        expect(brokenLinks(documents, PUBLISHED)).toEqual([]);
    });

    it('fails a link to a route nothing declares, naming source and target', () => {
        const documents = [doc('/docs/', [link('/docs/reakt/')])];
        const [failure, ...rest] = brokenLinks(documents, PUBLISHED);
        expect(rest).toEqual([]);
        expect(failure.source).toBe('/docs/');
        expect(failure.href).toBe('/docs/reakt/');
        expect(failure.reason).toContain('/docs/reakt/');
    });

    it('fails a declared route written without its trailing slash', () => {
        const documents = [
            doc('/docs/', [link('/docs/react')]),
            doc('/docs/react/', []),
        ];
        expect(brokenLinks(documents, PUBLISHED)).toHaveLength(1);
    });

    it('passes a path the tree publishes without a content document', () => {
        const documents = [
            doc('/docs/', [link('/examples/svelte/'), link('/size/')]),
        ];
        expect(brokenLinks(documents, PUBLISHED)).toEqual([]);
    });

    it('passes an anchor a heading in the target document carries', () => {
        const documents = [
            doc('/docs/', [link('/docs/react/#selector-cadence')]),
            doc('/docs/react/', [
                heading('Selector cadence', 'selector-cadence'),
            ]),
        ];
        expect(brokenLinks(documents, PUBLISHED)).toEqual([]);
    });

    it('fails an anchor no heading in the target document carries', () => {
        const documents = [
            doc('/docs/', [link('/docs/react/#selector-cadence')]),
            doc('/docs/react/', [heading('Something else', 'something-else')]),
        ];
        const [failure] = brokenLinks(documents, PUBLISHED);
        expect(failure.source).toBe('/docs/');
        expect(failure.href).toBe('/docs/react/#selector-cadence');
        expect(failure.reason).toContain('selector-cadence');
        expect(failure.reason).toContain('/docs/react/');
    });

    /*
     * The reason slugs are persisted at all: a section that has been retitled
     * keeps its slug, so the link into it must still resolve, and the title it
     * now carries must not.
     */
    it('resolves an anchor against the persisted slug, never the heading text', () => {
        const documents = [
            doc('/docs/', [link('/docs/react/#selector-cadence')]),
            doc('/docs/react/', [
                heading('How often selectors notify', 'selector-cadence'),
            ]),
        ];
        expect(brokenLinks(documents, PUBLISHED)).toEqual([]);

        const byText = [
            doc('/docs/', [link('/docs/react/#how-often-selectors-notify')]),
            doc('/docs/react/', [
                heading('How often selectors notify', 'selector-cadence'),
            ]),
        ];
        expect(brokenLinks(byText, PUBLISHED)).toHaveLength(1);
    });

    it('resolves a bare anchor against the source document’s own headings', () => {
        const documents = [
            doc('/docs/csp/', [
                link('#audio-and-video'),
                heading('Audio and video', 'audio-and-video'),
            ]),
        ];
        expect(brokenLinks(documents, PUBLISHED)).toEqual([]);
    });

    it('fails a bare anchor the source document does not carry', () => {
        const documents = [doc('/docs/csp/', [link('#audio-and-video')])];
        const [failure] = brokenLinks(documents, PUBLISHED);
        expect(failure.source).toBe('/docs/csp/');
        expect(failure.reason).toContain('audio-and-video');
    });

    /*
     * A heading inside a callout or a tab still renders its slug as an id, so a
     * link into one resolves. The table of contents deliberately ignores nested
     * headings; the gate deliberately does not.
     */
    it('sees a heading nested inside a container block', () => {
        const documents = [
            doc('/docs/', [link('/docs/react/#inside')]),
            doc('/docs/react/', [
                {
                    type: 'callout',
                    attrs: { kind: 'note' },
                    content: [heading('Inside', 'inside')],
                },
            ]),
        ];
        expect(brokenLinks(documents, PUBLISHED)).toEqual([]);
    });

    /*
     * A page rendered from code has no persisted slugs, so an anchor into one
     * cannot be proven. It fails rather than passing quietly: the gate's promise
     * is that every anchor is backed by a slug, and a silent pass would make that
     * promise a half-truth.
     */
    it('fails an anchor into a path no content document backs', () => {
        const documents = [doc('/docs/', [link('/size/#method')])];
        const [failure] = brokenLinks(documents, PUBLISHED);
        expect(failure.reason).toContain('/size/');
        expect(failure.reason).toContain('method');
    });

    it('ignores external links rather than reaching for the network', () => {
        const documents = [
            doc('/docs/', [
                link('https://iiif.io/api/presentation/3.0/#start'),
                link('mailto:someone@example.org'),
                link('//example.org/thing'),
            ]),
        ];
        expect(brokenLinks(documents, PUBLISHED)).toEqual([]);
    });

    it('reports every broken link, not only the first', () => {
        const documents = [
            doc('/docs/', [link('/nowhere/'), link('/elsewhere/')]),
        ];
        expect(brokenLinks(documents, PUBLISHED)).toHaveLength(2);
    });
});
