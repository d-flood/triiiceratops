/**
 * Describing material the stage has never declared. Nothing a IIIF publisher
 * writes is guaranteed, so what is asserted here is mostly what happens when
 * the manifest does not say: the stage still gets a box and a name.
 */

import { describe, expect, it } from 'vitest';

import { describeDroppedManifest, firstCanvasId } from '$lib/droppedMaterial';

const MANIFEST =
    'https://iiif.io/api/cookbook/recipe/0006-text-language/manifest.json';

function manifest(overrides: Record<string, unknown> = {}) {
    return {
        id: MANIFEST,
        type: 'Manifest',
        label: { en: ["Whistler's Mother"] },
        items: [
            {
                id: `${MANIFEST}/canvas/p1`,
                type: 'Canvas',
                width: 1114,
                height: 991,
            },
            {
                id: `${MANIFEST}/canvas/p2`,
                type: 'Canvas',
                width: 800,
                height: 600,
            },
        ],
        ...overrides,
    };
}

describe('describeDroppedManifest', () => {
    it('takes the label, the canvas count and the first canvas’s shape', () => {
        expect(describeDroppedManifest(MANIFEST, manifest())).toEqual({
            manifest: MANIFEST,
            canvases: 2,
            label: "Whistler's Mother",
            firstCanvas: { width: 1114, height: 991 },
        });
    });

    // The Cookbook's own recipes are full of these.
    it('reads an untagged label, and a language that is not English', () => {
        expect(
            describeDroppedManifest(
                MANIFEST,
                manifest({ label: { none: ['Sin título'] } }),
            ).label,
        ).toBe('Sin título');
        expect(
            describeDroppedManifest(
                MANIFEST,
                manifest({ label: { de: ['Der Titel'] } }),
            ).label,
        ).toBe('Der Titel');
    });

    it('prefers English where the publisher offers several', () => {
        expect(
            describeDroppedManifest(
                MANIFEST,
                manifest({ label: { de: ['Der Titel'], en: ['The Title'] } }),
            ).label,
        ).toBe('The Title');
    });

    it('still reserves a box and names something for a manifest that says neither', () => {
        const described = describeDroppedManifest(MANIFEST, {
            items: [{ id: 'c1', type: 'Canvas' }],
        });

        expect(described.label).toBeTruthy();
        expect(described.firstCanvas.width).toBeGreaterThan(0);
        expect(described.firstCanvas.height).toBeGreaterThan(0);
        expect(described.canvases).toBe(1);
    });

    it('survives a document that is not a manifest at all', () => {
        for (const junk of [null, 'not json', 42, {}, { items: 'no' }]) {
            const described = describeDroppedManifest(MANIFEST, junk);
            expect(described.canvases).toBeGreaterThan(0);
            expect(described.firstCanvas.height).toBeGreaterThan(0);
        }
    });
});

describe('firstCanvasId', () => {
    it('is the first canvas, for a state that named no canvas', () => {
        expect(firstCanvasId(manifest())).toBe(`${MANIFEST}/canvas/p1`);
    });

    it('is empty when there is nothing to open', () => {
        expect(firstCanvasId({ items: [] })).toBe('');
        expect(firstCanvasId(null)).toBe('');
    });
});
