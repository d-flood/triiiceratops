import { describe, expect, it } from 'vitest';
// The drift job's comparison logic lives in the CLI script; only its pure parts
// are exercised here, with literal documents. This suite must stay offline —
// nothing outside `scripts/recipe-drift.mjs` itself may reach the network.
// @ts-expect-error - plain ESM maintenance script, deliberately untyped
import {
    canonicalJson,
    checkFixtureExpectations,
    diffJson,
    documentId,
} from '../../../../../scripts/recipe-drift.mjs';

describe('canonicalJson', () => {
    it('ignores key order, so a re-serialised manifest is not drift', () => {
        const committed = {
            id: 'x',
            type: 'Manifest',
            items: [{ a: 1, b: 2 }],
        };
        const live = { items: [{ b: 2, a: 1 }], type: 'Manifest', id: 'x' };
        expect(canonicalJson(committed)).toBe(canonicalJson(live));
    });

    it('distinguishes documents that really differ', () => {
        expect(canonicalJson({ height: 1800 })).not.toBe(
            canonicalJson({ height: 1900 }),
        );
    });
});

describe('diffJson', () => {
    it('names a changed scalar by its path', () => {
        const result = diffJson(
            { items: [{ height: 1800 }] },
            { items: [{ height: 1900 }] },
        );
        expect(result.paths).toEqual(['items/0/height: 1800 -> 1900']);
        expect(result.total).toBe(1);
    });

    it('reports added and removed keys and array entries', () => {
        const result = diffJson(
            { label: { en: ['One'] }, rights: 'x' },
            { label: { en: ['One', 'Two'], fr: ['Un'] } },
        );
        expect(result.paths).toEqual([
            'label/en/1: added',
            'label/fr: added',
            'rights: removed',
        ]);
    });

    it('reports a changed shape rather than recursing into it', () => {
        const result = diffJson({ partOf: [{ id: 'a' }] }, { partOf: 'a' });
        expect(result.paths).toEqual(['partOf: [{"id":"a"}] -> "a"']);
    });

    it('finds nothing when only key order differs', () => {
        const result = diffJson({ a: 1, b: 2 }, { b: 2, a: 1 });
        expect(result.paths).toEqual([]);
        expect(result.total).toBe(0);
    });

    it('caps the reported paths and counts the rest', () => {
        const committed = Object.fromEntries(
            Array.from({ length: 30 }, (_, i) => [`k${i}`, i]),
        );
        const live = Object.fromEntries(
            Array.from({ length: 30 }, (_, i) => [`k${i}`, i + 1]),
        );
        const result = diffJson(committed, live, { limit: 3 });
        expect(result.paths).toHaveLength(3);
        expect(result.total).toBe(30);
        expect(result.truncated).toBe(false);
    });

    it('abandons a wholesale restructuring instead of enumerating it', () => {
        const committed = Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [`k${i}`, i]),
        );
        const result = diffJson(committed, {}, { limit: 2, scanLimit: 10 });
        expect(result.paths).toHaveLength(2);
        expect(result.total).toBe(10);
        expect(result.truncated).toBe(true);
    });

    it('does not claim truncation for exactly scanLimit real differences', () => {
        const committed = Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [`k${i}`, i]),
        );
        const live = Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [`k${i}`, i + 1]),
        );
        const result = diffJson(committed, live, { limit: 2, scanLimit: 10 });
        expect(result.total).toBe(10);
        expect(result.truncated).toBe(false);
    });

    it('reports an abandoned walk even when no paths are hidden', () => {
        const committed = Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [`k${i}`, i]),
        );
        // limit >= scanLimit, so `total - paths.length` is 0 and only the
        // truncation flag can tell the reader the diff is incomplete.
        const result = diffJson(committed, {}, { limit: 20, scanLimit: 10 });
        expect(result.paths).toHaveLength(10);
        expect(result.total).toBe(10);
        expect(result.truncated).toBe(true);
    });
});

describe('documentId', () => {
    it('reads both IIIF spellings', () => {
        expect(documentId({ id: 'a' })).toBe('a');
        expect(documentId({ '@id': 'b' })).toBe('b');
        expect(documentId(undefined)).toBeUndefined();
    });
});

describe('checkFixtureExpectations', () => {
    const fixture = {
        id: 'string-target-region',
        recipe: '0299-region',
        capturedAt: '2026-08-20',
        expected: {
            manifestId: 'https://example.org/manifest.json',
            canvasId: 'https://example.org/canvas/p1',
        },
    };
    const live = {
        id: 'https://example.org/manifest.json',
        items: [{ id: 'https://example.org/canvas/p1' }],
    };

    it('passes when the live manifest still satisfies the fixture', () => {
        expect(checkFixtureExpectations(fixture, live)).toEqual([]);
    });

    it('reports a manifest id that no longer matches', () => {
        const problems = checkFixtureExpectations(fixture, {
            ...live,
            id: 'https://example.org/other.json',
        });
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('https://example.org/other.json');
    });

    it('does not also report canvases of a document that is not the pinned one', () => {
        expect(
            checkFixtureExpectations(fixture, { id: 'elsewhere' }),
        ).toHaveLength(1);
    });

    it('reports a canvas that has left the manifest', () => {
        const problems = checkFixtureExpectations(fixture, {
            ...live,
            items: [{ id: 'https://example.org/canvas/p2' }],
        });
        expect(problems).toEqual([
            'canvas https://example.org/canvas/p1 is no longer in items',
        ]);
    });

    it('checks only the manifest id when the fixture pins no canvas', () => {
        const bare = { ...fixture, expected: { manifestId: live.id } };
        expect(checkFixtureExpectations(bare, { id: live.id })).toEqual([]);
    });
});
