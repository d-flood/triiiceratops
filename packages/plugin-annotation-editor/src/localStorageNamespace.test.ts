import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';
import type { W3CAnnotation } from './adapters/types';

/**
 * The 1.0 LocalStorage namespace is a FROZEN, versioned, package-qualified key
 * (SPEC — "the 1.0 LocalStorage Adapter uses a new stable, versioned,
 * package-qualified key"). RC-era data is disposable and must be left completely
 * alone: never read, migrated, deleted, or overwritten. These tests pin both
 * halves of that contract.
 */

const V1_PREFIX = '@triiiceratops/plugin-annotation-editor:v1';

/** The prerelease (RC) key the OLD in-core adapter wrote under. */
const rcKey = (manifestId: string, canvasId: string): string =>
    `triiiceratops:annotations:${encodeURIComponent(manifestId)}:${encodeURIComponent(canvasId)}`;

function sample(id: string, canvasId: string): W3CAnnotation {
    return {
        '@context': 'http://www.w3.org/ns/anno.jsonld',
        id,
        type: 'Annotation',
        motivation: 'commenting',
        body: [{ type: 'TextualBody', purpose: 'commenting', value: 'hi' }],
        target: {
            type: 'SpecificResource',
            source: canvasId,
            selector: {
                type: 'FragmentSelector',
                conformsTo: 'http://www.w3.org/TR/media-frags/',
                value: 'xywh=10,20,30,40',
            },
        },
    };
}

const MANIFEST = 'https://example.org/manifest';
const CANVAS = 'https://example.org/canvas/1';

describe('LocalStorageAdapter 1.0 namespace', () => {
    beforeEach(() => {
        localStorage.clear();
    });
    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('writes only under the frozen v1 package-qualified key', async () => {
        const adapter = new LocalStorageAdapter();
        await adapter.create(MANIFEST, CANVAS, sample('anno-1', CANVAS));

        const keys = Object.keys(localStorage);
        expect(keys.length).toBeGreaterThan(0);
        expect(keys.every((k) => k.startsWith(V1_PREFIX))).toBe(true);
        // Never the RC namespace.
        expect(
            keys.some((k) => k.startsWith('triiiceratops:annotations:')),
        ).toBe(false);
    });

    it('leaves RC-era keys byte-identical and unread through a full create/edit/delete session', async () => {
        // Pre-seed disposable RC data for this canvas AND another canvas.
        const rcHere = rcKey(MANIFEST, CANVAS);
        const rcHereValue = JSON.stringify([
            { id: 'rc-1', type: 'Annotation', target: { source: CANVAS } },
        ]);
        const rcOther = rcKey(MANIFEST, 'https://example.org/canvas/other');
        const rcOtherValue = JSON.stringify([{ id: 'rc-2' }]);
        localStorage.setItem(rcHere, rcHereValue);
        localStorage.setItem(rcOther, rcOtherValue);

        const getSpy = vi.spyOn(Storage.prototype, 'getItem');

        const adapter = new LocalStorageAdapter();
        // A full session: create → edit → load → delete, all on the SAME
        // manifest+canvas whose RC key is pre-seeded.
        await adapter.create(MANIFEST, CANVAS, sample('new-1', CANVAS));
        await adapter.update(MANIFEST, CANVAS, {
            ...sample('new-1', CANVAS),
            body: [
                { type: 'TextualBody', purpose: 'commenting', value: 'edited' },
            ],
        });
        const loaded = await adapter.load(MANIFEST, CANVAS);
        expect(loaded.find((a) => a.id === 'new-1')).toBeDefined();
        await adapter.delete(MANIFEST, CANVAS, 'new-1');

        // No RC key was ever read during the session.
        const readKeys = getSpy.mock.calls.map((c) => c[0]);
        expect(readKeys).not.toContain(rcHere);
        expect(readKeys).not.toContain(rcOther);
        // Every read the adapter performed was a v1 key.
        expect(readKeys.every((k) => String(k).startsWith(V1_PREFIX))).toBe(
            true,
        );

        // RC keys are still present and byte-identical (never migrated/overwritten).
        expect(localStorage.getItem(rcHere)).toBe(rcHereValue);
        expect(localStorage.getItem(rcOther)).toBe(rcOtherValue);
    });
});
