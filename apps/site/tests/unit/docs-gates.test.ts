/**
 * The two documentation gates, both of which read and write content documents.
 *
 * What matters about each is not the transform but the refusal: the doc-example
 * extractor must keep taking exactly the code blocks that are compiled guidance
 * and no others, and the content-state generator must rewrite one read-only
 * block's rows and nothing else in a document an author also edits.
 *
 * Both are driven here as pure functions over documents built for the case,
 * because the failures worth catching — an opt-out ignored, a fixture nobody
 * catalogued, a generator that rewrites prose — are each one document apart from
 * the real content and would otherwise only ever be exercised by the real
 * content, which has none of them.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
    examplesInDocument,
    extractDocExamples,
} from '../../../../scripts/docs-examples.mjs';
import {
    BLOCK,
    conformanceFixtures,
    orphanedFixtures,
    withFixtures,
} from '../../../../scripts/docs-content-state.mjs';

const scratches: string[] = [];

function scratch(): string {
    const dir = mkdtempSync(join(tmpdir(), 'docs-gates-'));
    scratches.push(dir);
    return dir;
}

afterEach(() => {
    for (const dir of scratches.splice(0))
        rmSync(dir, { recursive: true, force: true });
});

/** A code block as a content document carries one. */
function codeBlock(language: string, text: string, attrs: object = {}) {
    return {
        type: 'codeBlock',
        attrs: { language, ...attrs },
        content: [{ type: 'text', text }],
    };
}

function doc(...content: object[]) {
    return { type: 'doc', version: 2, content };
}

const EXAMPLE = "import { parseContentState } from 'triiiceratops';\n";

describe('the doc-example extractor', () => {
    it('takes a code block by its declared language, not by a fence', () => {
        const files = examplesInDocument(
            doc(codeBlock('ts', EXAMPLE)),
            'page',
            'page.json',
        );
        expect([...files.keys()]).toEqual(['page-01.ts']);
        expect(files.get('page-01.ts')).toContain(EXAMPLE.trim());
    });

    it('honours the exampleIgnore attribute', () => {
        const files = examplesInDocument(
            doc(codeBlock('ts', EXAMPLE, { exampleIgnore: true })),
            'page',
            'page.json',
        );
        expect([...files.keys()]).toEqual([]);
    });

    it('numbers what it takes in document order, skipping what it does not', () => {
        const files = examplesInDocument(
            doc(
                codeBlock('bash', 'pnpm add triiiceratops'),
                codeBlock('ts', 'const local = 1;\n'),
                codeBlock('tsx', EXAMPLE),
                codeBlock('ts', EXAMPLE),
            ),
            'page',
            'page.json',
        );
        expect([...files.keys()]).toEqual(['page-01.tsx', 'page-02.ts']);
    });

    it('reaches a code block nested inside a container block', () => {
        const files = examplesInDocument(
            doc({
                type: 'tabs',
                attrs: { group: 'framework' },
                content: [
                    {
                        type: 'tab',
                        attrs: { label: 'React' },
                        content: [codeBlock('tsx', EXAMPLE)],
                    },
                ],
            }),
            'page',
            'page.json',
        );
        expect([...files.keys()]).toEqual(['page-01.tsx']);
    });

    it('takes a vue block’s TypeScript script setup and nothing else', () => {
        const sfc = (script: string) =>
            `<script setup ${script}>\n${EXAMPLE}</script>\n\n<template>\n  <div />\n</template>\n`;
        const files = examplesInDocument(
            doc(codeBlock('vue', sfc('lang="ts"')), codeBlock('vue', sfc(''))),
            'page',
            'page.json',
        );
        expect([...files.keys()]).toEqual(['page-01.ts']);
        expect(files.get('page-01.ts')).not.toContain('<template>');
    });

    it('names each file after the document it came from', () => {
        const dir = scratch();
        writeFileSync(
            join(dir, 'install.json'),
            JSON.stringify(doc(codeBlock('ts', EXAMPLE))),
        );
        const files = extractDocExamples(dir);
        expect([...files.keys()]).toContain('install-01.ts');
        expect(files.get('install-01.ts')).toContain('GENERATED from');
    });
});

describe('the content-state conformance table', () => {
    const fixtures = [
        {
            form: 'Bare IIIF URI',
            resolvesVia: 'Returned as the manifest id',
            file: 'bare-uri.txt',
            recipe: '0009-book-1',
            capturedAt: '2026-08-20',
        },
    ];

    /** A hand-written page: prose, the generated block, more prose. */
    function page(attrs: object = { fixtures: [] }) {
        return doc(
            {
                type: 'paragraph',
                attrs: { id: 'lede' },
                content: [{ type: 'text', text: 'Prose.' }],
            },
            { type: BLOCK, attrs },
            {
                type: 'paragraph',
                attrs: { id: 'tail' },
                content: [{ type: 'text', text: 'More.' }],
            },
        );
    }

    it('is derived from the fixture index, recipe and all', () => {
        const dir = scratch();
        writeFileSync(
            join(dir, 'index.json'),
            JSON.stringify({
                fixtures: [
                    { ...fixtures[0], id: 'bare-uri', recipe: undefined },
                ],
            }),
        );
        expect(conformanceFixtures(join(dir, 'index.json'))).toEqual([
            { ...fixtures[0], recipe: null },
        ]);
    });

    it('rewrites the block’s rows and leaves the prose around it alone', () => {
        const before = page();
        const after = withFixtures(before, fixtures);
        expect(after.content[1]).toEqual({ type: BLOCK, attrs: { fixtures } });
        expect(after.content[0]).toEqual(before.content[0]);
        expect(after.content[2]).toEqual(before.content[2]);
    });

    it('keeps the identity the editor stamped on the block', () => {
        const after = withFixtures(
            page({ fixtures: [], id: 'stamped' }),
            fixtures,
        );
        expect(after.content[1]).toEqual({
            type: BLOCK,
            attrs: { fixtures, id: 'stamped' },
        });
    });

    it('refuses a page that does not carry exactly one of the block', () => {
        expect(() => withFixtures(doc(), fixtures)).toThrow(BLOCK);
        expect(() =>
            withFixtures(doc({ type: BLOCK }, { type: BLOCK }), fixtures),
        ).toThrow(BLOCK);
    });

    it('reports a fixture file no index entry names', () => {
        const dir = scratch();
        writeFileSync(
            join(dir, 'index.json'),
            JSON.stringify({ fixtures: [fixtures[0]] }),
        );
        writeFileSync(
            join(dir, 'bare-uri.txt'),
            'https://example.org/manifest.json',
        );
        expect(orphanedFixtures(join(dir, 'index.json'))).toEqual([]);

        writeFileSync(join(dir, 'uncatalogued.json'), '{}');
        expect(orphanedFixtures(join(dir, 'index.json'))).toEqual([
            'uncatalogued.json',
        ]);
    });
});
