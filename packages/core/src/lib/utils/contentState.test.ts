import { afterEach, describe, expect, it } from 'vitest';

import { configureLogging } from '../logging/logger';
import {
    contentStateFixtures,
    RESOLUTION_TABLE_ROWS,
    type ContentStateFixture,
} from '../test/fixtures/contentState';
import { parseContentState } from './contentState';

/**
 * Content-state resolution, driven off the committed fixture index. Adding a
 * fixture there adds coverage here — and the same index generates the published
 * conformance table, so the documented claim is this suite's claim.
 *
 * Nothing here reaches the network: parsing a content state dereferences nothing.
 */

function fixture(id: string): ContentStateFixture {
    const found = contentStateFixtures.find((entry) => entry.id === id);
    if (!found) throw new Error(`no content-state fixture named ${id}`);
    return found;
}

/** Collect the dev-mode warnings a call emits. */
function warningsFrom(input: string): string[] {
    const records: string[] = [];
    configureLogging({
        debug: true,
        sink: (level, args) => {
            if (level === 'warn') records.push(args.join(' '));
        },
    });
    parseContentState(input);
    return records;
}

afterEach(() => {
    configureLogging({ debug: false, sink: null });
});

describe('contentState fixtures', () => {
    it.each(contentStateFixtures)(
        'resolves the $form fixture ($id)',
        ({ input, expected }) => {
            expect(parseContentState(input)).toEqual(expected);
        },
    );

    it('pins every row of the resolution table', () => {
        const covered = new Set(contentStateFixtures.map((f) => f.row));
        expect(
            RESOLUTION_TABLE_ROWS.filter((row) => !covered.has(row)),
        ).toEqual([]);
    });

    it.each(contentStateFixtures.filter((f) => f.warns))(
        'warns about $id',
        ({ input, warns }) => {
            expect(warningsFrom(input).join(' ')).toContain(warns);
        },
    );
});

describe('contentState', () => {
    it('resolves the Manifest from an object target’s partOf, not the annotation id', () => {
        const { input } = fixture('object-target-partof-array');

        expect(parseContentState(input)).toEqual({
            manifestId:
                'https://iiif.io/api/cookbook/recipe/0299-region/manifest.json',
            canvasId:
                'https://iiif.io/api/cookbook/recipe/0299-region/canvas/p1',
            region: { x: 265, y: 661, width: 1260, height: 1239 },
        });
    });

    it('resolves a non-Annotation resource’s Manifest from partOf, not its own id', () => {
        const { input } = fixture('canvas-document-partof');

        expect(parseContentState(input)).toEqual({
            manifestId:
                'https://iiif.io/api/cookbook/recipe/0009-book-1/manifest.json',
            canvasId:
                'https://iiif.io/api/cookbook/recipe/0009-book-1/canvas/p2',
        });
    });

    it('resolves the Manifest from a SpecificResource target’s source.partOf', () => {
        const { input } = fixture('specific-resource-source-partof');

        expect(parseContentState(input)).toEqual({
            manifestId:
                'https://iiif.io/api/cookbook/recipe/0306-linking-annotations-to-manifests/manifest.json',
            canvasId:
                'https://iiif.io/api/cookbook/recipe/0306-linking-annotations-to-manifests/canvas-1',
            region: { x: 300, y: 800, width: 1200, height: 1200 },
        });
    });

    it('does not hand back a Collection as the manifest id', () => {
        const { input } = fixture('partof-array-no-manifest');

        expect(parseContentState(input)).toBeNull();
    });

    it('skips a Collection when picking the Manifest out of a partOf array', () => {
        const { input } = fixture('partof-array-collection-first');

        expect(parseContentState(input)?.manifestId).toBe(
            'https://iiif.io/api/cookbook/recipe/0009-book-1/manifest.json',
        );
    });

    /*
     * Cookbook recipe 0599 publishes two drag sources, and the first targets a
     * Manifest with no `partOf` at all. Both are quoted literally: this is the
     * exchange a reader dragging the recipe's own logo hands the viewer.
     */
    describe('cookbook recipe 0599’s published drag payloads', () => {
        const MANIFEST =
            'https://iiif.io/api/cookbook/recipe/0006-text-language/manifest.json';

        const state = (target: unknown) =>
            JSON.stringify({
                '@context': 'http://iiif.io/api/presentation/3/context.json',
                id: 'https://iiif.io/api/cookbook/recipe/0599-drag-and-drop/dnd-manifest',
                type: 'Annotation',
                motivation: ['contentState'],
                target,
            });

        it('opens a Manifest target, which names no view inside it', () => {
            expect(
                parseContentState(state({ id: MANIFEST, type: 'Manifest' })),
            ).toEqual({ manifestId: MANIFEST });
        });

        it('opens a Canvas target at the canvas its partOf places', () => {
            const canvasId =
                'https://iiif.io/api/cookbook/recipe/0006-text-language/canvas/p1';

            expect(
                parseContentState(
                    state({
                        id: canvasId,
                        type: 'Canvas',
                        partOf: [{ id: MANIFEST, type: 'Manifest' }],
                    }),
                ),
            ).toMatchObject({ manifestId: MANIFEST, canvasId });
        });
    });

    it('parses target canvas ids and xywh regions via shared IIIF helpers', () => {
        const payload = {
            id: 'annotation-1',
            type: 'Annotation',
            target: 'https://example.org/canvas/1#xywh=1236,906,104,336',
            partOf: {
                id: 'https://example.org/manifest/1',
            },
        };
        const value = Buffer.from(JSON.stringify(payload), 'utf8')
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');

        expect(parseContentState(value)).toEqual({
            manifestId: 'https://example.org/manifest/1',
            canvasId: 'https://example.org/canvas/1',
            region: {
                x: 1236,
                y: 906,
                width: 104,
                height: 336,
            },
        });
    });

    it('parses a content state target carrying a `#t=` media time', () => {
        const payload = {
            id: 'annotation-2',
            type: 'Annotation',
            target: 'https://example.org/canvas/1#t=157,203',
            partOf: {
                id: 'https://example.org/manifest/1',
            },
        };
        const value = Buffer.from(JSON.stringify(payload), 'utf8')
            .toString('base64url')
            .replace(/=+$/g, '');

        expect(parseContentState(value)).toEqual({
            manifestId: 'https://example.org/manifest/1',
            canvasId: 'https://example.org/canvas/1',
            time: { seconds: 157, endSeconds: 203 },
        });
    });

    it('resolves recipe 0485’s published iiif-content value, verbatim', () => {
        const { input } = fixture('0485-published');

        expect(parseContentState(input)).toEqual({
            manifestId:
                'https://iiif.io/api/cookbook/recipe/0009-book-1/manifest.json',
            canvasId:
                'https://iiif.io/api/cookbook/recipe/0009-book-1/canvas/p2',
            region: { x: 1528, y: 3024, width: 344, height: 408 },
        });
    });

    it('leaves a percent sign inside a JSON string value alone', () => {
        const payload = {
            id: 'https://example.org/annotation/50%25',
            type: 'Annotation',
            target: 'https://example.org/canvas/1',
            partOf: { id: 'https://example.org/manifest/50%25' },
        };
        const value = Buffer.from(JSON.stringify(payload), 'utf8').toString(
            'base64url',
        );

        expect(parseContentState(value)).toEqual({
            manifestId: 'https://example.org/manifest/50%25',
            canvasId: 'https://example.org/canvas/1',
        });
    });

    it.each([
        ['an empty value', ''],
        ['whitespace', '   '],
        ['a non-IIIF scheme', 'ftp://example.org/manifest.json'],
        ['undecodable base64', '!!!not-base64!!!'],
        ['a truncated JSON document', '{"type":"Annotation"'],
        ['a JSON array', '[]'],
        ['a JSON scalar', '42'],
        ['an annotation with no target and no partOf', '{"type":"Annotation"}'],
    ])('returns null rather than throwing for %s', (_label, value) => {
        expect(parseContentState(value)).toBeNull();
    });
});
