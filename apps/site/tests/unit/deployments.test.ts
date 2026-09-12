/**
 * The deployments on `/production/`, which are now composed blocks in the
 * document rather than a declaration in TypeScript.
 *
 * What is asserted is the shape the page's argument depends on: that every row
 * names somebody and carries a link, that a reading room offers both the
 * landing page and the evidence, and that mkiiif is a second kind of entry
 * rather than a sixth reading room. Whether those links still resolve is
 * verified by hand when an entry is added, not here: the site cannot gate on the
 * continued existence of somebody else's server.
 *
 * The rows carry no `kind` attribute any more — a `linkRow` is named for the
 * shape it draws, not for what this page puts in it — so the two groupings are
 * addressed by the heading each one follows.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

type Node = {
    type: string;
    attrs?: Record<string, unknown>;
    content?: Node[];
};

const document = JSON.parse(
    readFileSync(
        new URL('../../content/production.json', import.meta.url),
        'utf8',
    ),
) as { content: Node[] };

/** The rows of the `linkRows` group following the heading with this slug. */
function groupAfter(slug: string): Node[] {
    const heading = document.content.findIndex(
        (node) => node.type === 'heading' && node.attrs?.slug === slug,
    );
    expect(heading, `no heading with slug ${slug}`).toBeGreaterThanOrEqual(0);
    const group = document.content[heading + 1];
    expect(group.type).toBe('linkRows');
    return group.content ?? [];
}

const readingRooms = groupAfter('reading-rooms-running-the-viewer');
const tools = groupAfter('tools-that-ship-the-viewer');
const rows = [...readingRooms, ...tools];

const text = (node: Node, key: string) => String(node.attrs?.[key] ?? '');

describe('every deployment row', () => {
    it('names its institution or project and says what it is', () => {
        for (const row of rows) {
            expect(row.type).toBe('linkRow');
            expect(text(row, 'label').trim().length).toBeGreaterThan(0);
            expect(text(row, 'note').trim().length).toBeGreaterThan(0);
        }
    });

    it('carries an absolute link out to somebody else’s site', () => {
        for (const row of rows) {
            for (const href of [text(row, 'href'), text(row, 'actionHref')]) {
                if (href === '') continue;
                expect(href).toMatch(/^https:\/\//);
            }
        }
    });

    it('is listed once', () => {
        const hrefs = rows.map((row) => text(row, 'href'));
        expect(new Set(hrefs).size).toBe(hrefs.length);
    });
});

describe('the reading rooms', () => {
    it('offer both the landing page and a viewer example', () => {
        // Two different claims: the first says who runs it, the second is the
        // evidence. A reading room with no example is an assertion, not proof.
        expect(readingRooms.length).toBeGreaterThan(0);
        for (const room of readingRooms) {
            expect(text(room, 'actionHref')).not.toBe('');
            expect(text(room, 'actionLabel')).not.toBe('');
            expect(text(room, 'actionHref')).not.toBe(text(room, 'href'));
        }
    });

    it('do not lead with the maintainer’s own project', () => {
        // Paleo Bench is the entry a sceptical reader discounts, so it is not
        // the one the page opens with.
        const labels = readingRooms.map((room) => text(room, 'label'));
        expect(labels[0]).not.toBe('Paleo Bench');
        expect(labels).toContain('Paleo Bench');
    });
});

describe('mkiiif', () => {
    const mkiiif = tools.find((tool) => text(tool, 'label') === 'mkiiif');

    it('is grouped as a tool rather than as a reading room', () => {
        expect(mkiiif).toBeDefined();
        expect(
            readingRooms.some((room) => text(room, 'label') === 'mkiiif'),
        ).toBe(false);
    });

    it('links no generated example while the published viewer renders it blank', () => {
        // Its generated pages load the viewer from the CDN unpinned, so they
        // stay blank until the level-0 fix is released. A link offered as
        // evidence that shows nothing is worse than no link.
        expect(text(mkiiif!, 'actionHref')).toBe('');
    });
});
